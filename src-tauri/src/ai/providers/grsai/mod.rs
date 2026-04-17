use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::info;
use base64::{engine::general_purpose::STANDARD, Engine};

use crate::ai::error::AIError;
use crate::ai::{
    AIProvider, GenerateRequest, ProviderRuntimeConfig, ProviderTaskHandle, ProviderTaskPollResult,
    ProviderTaskSubmission,
};

const DRAW_ENDPOINT_PATH: &str = "/v1/draw/nano-banana";
const RESULT_ENDPOINT_PATH: &str = "/v1/draw/result";
const DEFAULT_BASE_URL: &str = "https://grsai.dakka.com.cn";
const DEFAULT_PRO_MODEL: &str = "nano-banana-pro";
const POLL_INTERVAL_MS: u64 = 2000;

const SUPPORTED_MODELS: [&str; 7] = [
    "nano-banana-2",
    "nano-banana-pro",
    "nano-banana-pro-vt",
    "nano-banana-pro-cl",
    "nano-banana-pro-vip",
    "nano-banana-pro-4k-vip",
    "grsai/nano-banana-pro",
];

fn decode_file_url_path(value: &str) -> String {
    let raw = value.trim_start_matches("file://");
    let decoded = urlencoding::decode(raw)
        .map(|result| result.into_owned())
        .unwrap_or_else(|_| raw.to_string());
    let normalized = if decoded.starts_with('/')
        && decoded.len() > 2
        && decoded.as_bytes().get(2) == Some(&b':')
    {
        &decoded[1..]
    } else {
        &decoded
    };
    normalized.to_string()
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

fn has_non_http_references(urls: &[String]) -> bool {
    urls.iter().any(|url| !is_http_url(url))
}

fn encode_reference_for_grsai(source: &str, prefer_data_url: bool) -> Option<String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return None;
    }

    if is_http_url(trimmed) {
        return Some(trimmed.to_string());
    }

    if let Some((meta, payload)) = trimmed.split_once(',') {
        if meta.starts_with("data:") && meta.ends_with(";base64") && !payload.is_empty() {
            if prefer_data_url {
                return Some(trimmed.to_string());
            }
            return Some(payload.to_string());
        }
    }

    let likely_base64 = trimmed.len() > 256
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=');
    if likely_base64 {
        if prefer_data_url {
            return Some(format!("data:image/png;base64,{}", trimmed));
        }
        return Some(trimmed.to_string());
    }

    let path = if trimmed.starts_with("file://") {
        PathBuf::from(decode_file_url_path(trimmed))
    } else {
        PathBuf::from(trimmed)
    };
    let bytes = std::fs::read(path).ok()?;
    let encoded = STANDARD.encode(bytes);
    if prefer_data_url {
        Some(format!("data:image/png;base64,{}", encoded))
    } else {
        Some(encoded)
    }
}

fn build_reference_urls(request: &GenerateRequest, prefer_data_url: bool) -> Option<Vec<String>> {
    request
        .reference_images
        .as_ref()
        .map(|images| {
            images
                .iter()
                .filter_map(|image| encode_reference_for_grsai(image, prefer_data_url))
                .collect::<Vec<_>>()
        })
        .filter(|images| !images.is_empty())
}

fn should_retry_with_data_urls(response: &Value, urls: Option<&Vec<String>>) -> bool {
    let Some(urls) = urls else {
        return false;
    };
    if !has_non_http_references(urls) {
        return false;
    }

    let code = response.get("code").and_then(|raw| raw.as_i64());
    if code != Some(-4) {
        return false;
    }

    let message = response
        .get("msg")
        .and_then(|raw| raw.as_str())
        .unwrap_or_default();
    let normalized = message.to_ascii_lowercase();
    normalized.contains("unexpected end of json input") || message.contains("参数数据类型错误")
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DrawRequestBody {
    model: String,
    prompt: String,
    aspect_ratio: String,
    image_size: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    urls: Option<Vec<String>>,
    web_hook: String,
    shut_progress: bool,
}

pub struct GrsaiProvider {
    client: Client,
    api_key: Arc<RwLock<Option<String>>>,
    base_url: Arc<RwLock<String>>,
}

impl GrsaiProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            api_key: Arc::new(RwLock::new(None)),
            base_url: Arc::new(RwLock::new(DEFAULT_BASE_URL.to_string())),
        }
    }

    fn normalize_requested_model(&self, request: &GenerateRequest) -> String {
        let requested = request
            .model
            .split_once('/')
            .map(|(_, model)| model.to_string())
            .unwrap_or_else(|| request.model.clone());

        if requested == "nano-banana-2" {
            return requested;
        }

        if requested == "nano-banana-pro" || requested.starts_with("nano-banana-pro-") {
            return request
                .extra_params
                .as_ref()
                .and_then(|params| params.get("grsai_pro_model"))
                .and_then(|value| value.as_str())
                .map(Self::normalize_pro_variant)
                .unwrap_or_else(|| requested);
        }

        DEFAULT_PRO_MODEL.to_string()
    }

    fn normalize_pro_variant(input: &str) -> String {
        let trimmed = input.trim().to_lowercase();
        if trimmed == DEFAULT_PRO_MODEL || trimmed.starts_with("nano-banana-pro-") {
            return trimmed;
        }
        DEFAULT_PRO_MODEL.to_string()
    }

    fn resolve_task_payload<'a>(value: &'a Value) -> Result<&'a Value, AIError> {
        if let Some(code) = value.get("code").and_then(|raw| raw.as_i64()) {
            if code != 0 {
                let msg = value
                    .get("msg")
                    .and_then(|raw| raw.as_str())
                    .unwrap_or("unknown error");
                return Err(AIError::Provider(format!("GRSAI API code {}: {}", code, msg)));
            }
            return value
                .get("data")
                .ok_or_else(|| AIError::Provider("GRSAI response missing data field".to_string()));
        }

        Ok(value)
    }

    fn extract_result_url(payload: &Value) -> Option<String> {
        payload
            .get("results")
            .and_then(|results| results.as_array())
            .and_then(|results| results.first())
            .and_then(|first| first.get("url"))
            .and_then(|url| url.as_str())
            .map(|url| url.to_string())
    }

    async fn send_draw_request(
        &self,
        endpoint: &str,
        api_key: &str,
        body: &DrawRequestBody,
    ) -> Result<Value, AIError> {
        let response = self
            .client
            .post(endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "GRSAI draw request failed {}: {}",
                status, error_text
            )));
        }

        response.json::<Value>().await.map_err(AIError::from)
    }

    async fn request_draw(&self, request: &GenerateRequest, model: String) -> Result<Value, AIError> {
        let body = DrawRequestBody {
            model,
            prompt: request.prompt.clone(),
            aspect_ratio: request.aspect_ratio.clone(),
            image_size: request.size.clone(),
            urls: build_reference_urls(request, false),
            web_hook: "-1".to_string(),
            shut_progress: true,
        };

        if request
            .reference_images
            .as_ref()
            .map(|images| !images.is_empty())
            .unwrap_or(false)
            && body.urls.is_none()
        {
            return Err(AIError::InvalidRequest(
                "Reference images are present but none could be encoded for GRSAI".to_string(),
            ));
        }

        let base_url = self.base_url.read().await.clone();
        let endpoint = format!("{}{}", base_url, DRAW_ENDPOINT_PATH);
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;

        info!("[GRSAI API] URL: {}", endpoint);
        let response = self
            .send_draw_request(endpoint.as_str(), api_key.as_str(), &body)
            .await?;

        if should_retry_with_data_urls(&response, body.urls.as_ref()) {
            info!(
                "[GRSAI API] Retry draw with data URL references: model={}, refs={}",
                body.model,
                body.urls.as_ref().map(|items| items.len()).unwrap_or(0)
            );
            let retry_urls = build_reference_urls(request, true);
            let retry_body = DrawRequestBody {
                urls: retry_urls,
                ..body.clone()
            };
            let retry_response = self
                .send_draw_request(endpoint.as_str(), api_key.as_str(), &retry_body)
                .await?;
            return Ok(retry_response);
        }

        Ok(response)
    }

    async fn poll_result_once(&self, task_id: &str) -> Result<ProviderTaskPollResult, AIError> {
        let base_url = self.base_url.read().await.clone();
        let endpoint = format!("{}{}", base_url, RESULT_ENDPOINT_PATH);
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;

        let response = self
            .client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&json!({ "id": task_id }))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "GRSAI result request failed {}: {}",
                status, error_text
            )));
        }

        let poll_response = response.json::<Value>().await?;
        let payload = Self::resolve_task_payload(&poll_response)?;

        if let Some(url) = Self::extract_result_url(payload) {
            return Ok(ProviderTaskPollResult::Succeeded(url));
        }

        match payload.get("status").and_then(|raw| raw.as_str()) {
            Some("running") | None => Ok(ProviderTaskPollResult::Running),
            Some("failed") => {
                let reason = payload
                    .get("error")
                    .and_then(|raw| raw.as_str())
                    .filter(|value| !value.is_empty())
                    .or_else(|| payload.get("failure_reason").and_then(|raw| raw.as_str()))
                    .unwrap_or("unknown failure");
                Ok(ProviderTaskPollResult::Failed(reason.to_string()))
            }
            Some(other) => Err(AIError::Provider(format!("GRSAI unexpected task status: {}", other))),
        }
    }

    async fn poll_result_until_complete(&self, task_id: &str) -> Result<String, AIError> {
        loop {
            match self.poll_result_once(task_id).await? {
                ProviderTaskPollResult::Running => sleep(Duration::from_millis(POLL_INTERVAL_MS)).await,
                ProviderTaskPollResult::Succeeded(url) => return Ok(url),
                ProviderTaskPollResult::Failed(message) => return Err(AIError::TaskFailed(message)),
            }
        }
    }
}

impl Default for GrsaiProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for GrsaiProvider {
    fn name(&self) -> &str {
        "grsai"
    }

    fn supports_model(&self, model: &str) -> bool {
        if model.starts_with("grsai/") {
            return true;
        }
        SUPPORTED_MODELS.contains(&model)
    }

    fn list_models(&self) -> Vec<String> {
        vec![
            "grsai/nano-banana-2".to_string(),
            "grsai/nano-banana-pro".to_string(),
        ]
    }

    async fn set_api_key(&self, api_key: String) -> Result<(), AIError> {
        let mut key = self.api_key.write().await;
        let normalized = api_key.trim().to_string();
        *key = if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        };
        Ok(())
    }

    async fn configure_runtime(&self, config: ProviderRuntimeConfig) -> Result<(), AIError> {
        self.set_api_key(config.api_key).await?;

        let normalized_base_url = config
            .base_url
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
            .trim()
            .trim_end_matches('/')
            .to_string();
        let next_base_url = if normalized_base_url.is_empty() {
            DEFAULT_BASE_URL.to_string()
        } else {
            normalized_base_url
        };
        let mut base_url = self.base_url.write().await;
        *base_url = next_base_url;
        Ok(())
    }

    fn supports_task_resume(&self) -> bool {
        true
    }

    async fn submit_task(&self, request: GenerateRequest) -> Result<ProviderTaskSubmission, AIError> {
        let model = self.normalize_requested_model(&request);
        let draw_response = self.request_draw(&request, model).await?;
        let payload = Self::resolve_task_payload(&draw_response)?;

        if let Some(url) = Self::extract_result_url(payload) {
            return Ok(ProviderTaskSubmission::Succeeded(url));
        }

        let task_id = payload
            .get("id")
            .and_then(|raw| raw.as_str())
            .ok_or_else(|| AIError::Provider("GRSAI response missing task id".to_string()))?;
        Ok(ProviderTaskSubmission::Queued(ProviderTaskHandle {
            task_id: task_id.to_string(),
            metadata: None,
        }))
    }

    async fn poll_task(&self, handle: ProviderTaskHandle) -> Result<ProviderTaskPollResult, AIError> {
        self.poll_result_once(handle.task_id.as_str()).await
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String, AIError> {
        let model = self.normalize_requested_model(&request);
        info!(
            "[GRSAI Request] model: {}, size: {}, aspect_ratio: {}",
            model, request.size, request.aspect_ratio
        );

        let draw_response = self.request_draw(&request, model).await?;
        let payload = Self::resolve_task_payload(&draw_response)?;

        if let Some(url) = Self::extract_result_url(payload) {
            return Ok(url);
        }

        let task_id = payload
            .get("id")
            .and_then(|raw| raw.as_str())
            .ok_or_else(|| AIError::Provider("GRSAI response missing task id".to_string()))?;

        self.poll_result_until_complete(task_id).await
    }
}
