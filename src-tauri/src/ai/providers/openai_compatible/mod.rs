use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

use crate::ai::error::AIError;
use crate::ai::{AIProvider, GenerateRequest};

const PROVIDER_ID: &str = "openai-compatible";

#[derive(Debug, Deserialize)]
struct OpenAiCompatibleImageResponse {
    data: Vec<OpenAiCompatibleImageItem>,
}

#[derive(Debug, Deserialize)]
struct OpenAiCompatibleImageItem {
    url: Option<String>,
    b64_json: Option<String>,
}

pub struct OpenAiCompatibleProvider {
    client: Client,
}

impl OpenAiCompatibleProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn normalize_reference_image(source: &str) -> Result<String, AIError> {
        let trimmed = source.trim();
        if trimmed.is_empty() {
            return Err(AIError::InvalidRequest(
                "Reference image source is empty".to_string(),
            ));
        }

        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return Ok(trimmed.to_string());
        }

        if let Some((meta, payload)) = trimmed.split_once(',') {
            if meta.starts_with("data:") && meta.ends_with(";base64") && !payload.is_empty() {
                return Ok(payload.to_string());
            }
        }

        let base64_like = trimmed.len() > 128
            && trimmed
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=');
        if base64_like {
            return Ok(trimmed.to_string());
        }

        let path = if trimmed.starts_with("file://") {
            let raw = trimmed.trim_start_matches("file://");
            let decoded = urlencoding::decode(raw)
                .map(|value| value.into_owned())
                .unwrap_or_else(|_| raw.to_string());
            if decoded.starts_with('/')
                && decoded.len() > 2
                && decoded.as_bytes().get(2) == Some(&b':')
            {
                PathBuf::from(&decoded[1..])
            } else {
                PathBuf::from(decoded)
            }
        } else {
            PathBuf::from(trimmed)
        };

        let bytes = std::fs::read(&path).map_err(|error| {
            AIError::InvalidRequest(format!(
                "Failed to read reference image \"{}\": {}",
                path.to_string_lossy(),
                error
            ))
        })?;
        Ok(STANDARD.encode(bytes))
    }

    fn parse_aspect_ratio(value: &str) -> f64 {
        let trimmed = value.trim();
        if let Some((width_raw, height_raw)) = trimmed.split_once(':') {
            let width = width_raw.trim().parse::<f64>().ok();
            let height = height_raw.trim().parse::<f64>().ok();
            if let (Some(width), Some(height)) = (width, height) {
                if width > 0.0 && height > 0.0 {
                    return width / height;
                }
            }
        }
        1.0
    }

    fn map_image_size(size: &str, aspect_ratio: &str) -> String {
        let longest_edge = match size.trim() {
            "2K" => 2048.0,
            "4K" => 4096.0,
            _ => 1024.0,
        };
        let ratio = Self::parse_aspect_ratio(aspect_ratio).clamp(0.25, 4.0);

        let (raw_width, raw_height) = if ratio >= 1.0 {
            (longest_edge, longest_edge / ratio)
        } else {
            (longest_edge * ratio, longest_edge)
        };

        let normalize_dimension = |value: f64| -> i64 {
            let rounded = (value / 64.0).round() * 64.0;
            rounded.clamp(256.0, 4096.0) as i64
        };

        format!(
            "{}x{}",
            normalize_dimension(raw_width),
            normalize_dimension(raw_height)
        )
    }

    fn extract_markdown_image_url(content: &str) -> Option<String> {
        let markdown_marker = "](";
        let start = content.find(markdown_marker)?;
        let url_start = start + markdown_marker.len();
        let rest = content.get(url_start..)?;
        let end = rest.find(')')?;
        let candidate = rest[..end].trim();
        if candidate.is_empty() {
            return None;
        }
        Some(candidate.to_string())
    }

    fn extract_url_like(content: &str) -> Option<String> {
        let trimmed = content.trim();
        if trimmed.starts_with("data:image/") || trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return Some(trimmed.to_string());
        }
        Self::extract_markdown_image_url(trimmed)
    }

    fn extract_image_from_chat_response(response: &Value) -> Option<String> {
        let choices = response.get("choices")?.as_array()?;
        let first = choices.first()?;
        let message = first.get("message")?;

        if let Some(images) = message.get("images").and_then(Value::as_array) {
            for image in images {
                if let Some(url) = image
                    .get("image_url")
                    .and_then(|value| value.get("url"))
                    .and_then(Value::as_str)
                    .or_else(|| image.get("url").and_then(Value::as_str))
                {
                    if !url.trim().is_empty() {
                        return Some(url.trim().to_string());
                    }
                }
                if let Some(base64_payload) = image
                    .get("b64_json")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                {
                    return Some(format!("data:image/png;base64,{}", base64_payload.trim()));
                }
            }
        }

        let content = message.get("content")?;
        if let Some(text) = content.as_str() {
            return Self::extract_url_like(text);
        }

        let content_items = content.as_array()?;
        for item in content_items {
            if let Some(text) = item
                .get("text")
                .and_then(Value::as_str)
                .and_then(Self::extract_url_like)
            {
                return Some(text);
            }

            if let Some(url) = item
                .get("image_url")
                .and_then(|value| value.get("url"))
                .and_then(Value::as_str)
                .or_else(|| item.get("url").and_then(Value::as_str))
            {
                if !url.trim().is_empty() {
                    return Some(url.trim().to_string());
                }
            }

            if let Some(base64_payload) = item
                .get("b64_json")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return Some(format!("data:image/png;base64,{}", base64_payload.trim()));
            }
        }

        None
    }

    async fn generate_via_images_api(
        &self,
        request: &GenerateRequest,
        runtime: &crate::ai::GenerateRuntimeConfig,
        base_url: &str,
        api_key: &str,
        api_model: &str,
    ) -> Result<String, AIError> {
        let endpoint = format!("{}/images/generations", base_url);

        let mut body = Map::new();
        body.insert("model".to_string(), json!(api_model));
        body.insert("prompt".to_string(), json!(request.prompt));
        body.insert("aspect_ratio".to_string(), json!(request.aspect_ratio));
        if !runtime.omit_size_params {
            let image_size = Self::map_image_size(&request.size, &request.aspect_ratio);
            body.insert("image_size".to_string(), json!(image_size.clone()));
            body.insert("size".to_string(), json!(image_size));
        }

        if let Some(reference_images) = request.reference_images.as_ref().filter(|items| !items.is_empty()) {
            let normalized_images = reference_images
                .iter()
                .take(3)
                .map(|image| Self::normalize_reference_image(image))
                .collect::<Result<Vec<_>, _>>()?;
            if let Some(first) = normalized_images.first() {
                body.insert("image".to_string(), json!(first));
            }
            if let Some(second) = normalized_images.get(1) {
                body.insert("image2".to_string(), json!(second));
            }
            if let Some(third) = normalized_images.get(2) {
                body.insert("image3".to_string(), json!(third));
            }
        }

        if let Some(extra_params) = request.extra_params.clone() {
            for (key, value) in extra_params {
                body.insert(key, value);
            }
        }

        let response = self
            .client
            .post(endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&Value::Object(body))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "OpenAI-compatible image generation failed {}: {}",
                status, error_text
            )));
        }

        let result = response.json::<OpenAiCompatibleImageResponse>().await?;
        let Some(first) = result.data.first() else {
            return Err(AIError::Provider(
                "OpenAI-compatible response missing image data".to_string(),
            ));
        };

        if let Some(url) = first.url.as_ref().filter(|value| !value.trim().is_empty()) {
            return Ok(url.clone());
        }

        if let Some(base64_payload) = first
            .b64_json
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            return Ok(format!("data:image/png;base64,{}", base64_payload));
        }

        Err(AIError::Provider(
            "OpenAI-compatible response has no url or b64_json".to_string(),
        ))
    }

    async fn generate_via_chat_completions(
        &self,
        request: &GenerateRequest,
        runtime: &crate::ai::GenerateRuntimeConfig,
        base_url: &str,
        api_key: &str,
        api_model: &str,
    ) -> Result<String, AIError> {
        let endpoint = format!("{}/chat/completions", base_url);

        let mut content = vec![json!({
            "type": "text",
            "text": request.prompt,
        })];

        if let Some(reference_images) = request.reference_images.as_ref().filter(|items| !items.is_empty()) {
            let normalized_images = reference_images
                .iter()
                .take(14)
                .map(|image| Self::normalize_reference_image(image))
                .collect::<Result<Vec<_>, _>>()?;
            for image in normalized_images {
                let image_url = if image.starts_with("http://") || image.starts_with("https://") || image.starts_with("data:image/") {
                    image
                } else {
                    format!("data:image/png;base64,{}", image)
                };
                content.push(json!({
                    "type": "image_url",
                    "image_url": {
                        "url": image_url,
                    }
                }));
            }
        }

        let mut body = Map::new();
        body.insert("model".to_string(), json!(api_model));
        body.insert("stream".to_string(), json!(false));
        body.insert(
            "messages".to_string(),
            json!([
                {
                    "role": "user",
                    "content": content,
                }
            ]),
        );
        body.insert("aspect_ratio".to_string(), json!(request.aspect_ratio));
        if !runtime.omit_size_params {
            body.insert("image_size".to_string(), json!(request.size));
        }

        if let Some(extra_params) = request.extra_params.clone() {
            for (key, value) in extra_params {
                body.insert(key, value);
            }
        }

        let response = self
            .client
            .post(endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&Value::Object(body))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "OpenAI-compatible chat image generation failed {}: {}",
                status, error_text
            )));
        }

        let result = response.json::<Value>().await?;
        if let Some(image_source) = Self::extract_image_from_chat_response(&result) {
            return Ok(image_source);
        }

        Err(AIError::Provider(
            "OpenAI-compatible chat response has no recognizable image output".to_string(),
        ))
    }
}

impl Default for OpenAiCompatibleProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for OpenAiCompatibleProvider {
    fn name(&self) -> &str {
        PROVIDER_ID
    }

    fn supports_model(&self, model: &str) -> bool {
        model.starts_with("openai-compatible/")
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String, AIError> {
        let runtime = request.runtime_config.clone().ok_or_else(|| {
            AIError::InvalidRequest("Missing custom API runtime config".to_string())
        })?;

        let api_key = runtime.api_key.trim();
        if api_key.is_empty() {
            return Err(AIError::InvalidRequest("API key is required".to_string()));
        }

        let base_url = runtime.base_url.trim().trim_end_matches('/');
        if base_url.is_empty() {
            return Err(AIError::InvalidRequest("Base URL is required".to_string()));
        }

        let api_model = runtime.api_model.trim();
        if api_model.is_empty() {
            return Err(AIError::InvalidRequest("Model name is required".to_string()));
        }

        if runtime.request_mode == "chat-completions" {
            return self
                .generate_via_chat_completions(&request, &runtime, base_url, api_key, api_model)
                .await;
        }

        self.generate_via_images_api(&request, &runtime, base_url, api_key, api_model)
            .await
    }
}
