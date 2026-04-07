use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{multipart, Client};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::ai::error::AIError;
use crate::ai::{AIProvider, GenerateRequest};

fn rand_seed() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64
        * 1_000_003
        + SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

const PROVIDER_ID: &str = "comfyui";

#[derive(Debug, Deserialize)]
struct ComfyPromptResponse {
    prompt_id: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ComfyUploadImageResponse {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ComfyHistoryItem {
    outputs: Option<HashMap<String, ComfyHistoryNodeOutput>>,
    status: Option<ComfyHistoryStatus>,
}

#[derive(Debug, Deserialize)]
struct ComfyHistoryStatus {
    status_str: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ComfyHistoryNodeOutput {
    images: Option<Vec<ComfyHistoryImage>>,
}

#[derive(Debug, Deserialize)]
struct ComfyHistoryImage {
    filename: Option<String>,
    subfolder: Option<String>,
    #[serde(rename = "type")]
    image_type: Option<String>,
}

pub struct ComfyUiProvider {
    client: Client,
}

impl ComfyUiProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn normalize_base_url(value: &str) -> String {
        value.trim().trim_end_matches('/').to_string()
    }

    fn normalize_reference_image(source: &str) -> Result<Vec<u8>, AIError> {
        let trimmed = source.trim();
        if trimmed.is_empty() {
            return Err(AIError::InvalidRequest("Reference image source is empty".to_string()));
        }

        if let Some((meta, payload)) = trimmed.split_once(',') {
            if meta.starts_with("data:") && meta.ends_with(";base64") {
                return STANDARD
                    .decode(payload.as_bytes())
                    .map_err(|error| AIError::InvalidRequest(format!("Invalid image payload: {error}")));
            }
        }

        let base64_like = trimmed.len() > 128
            && trimmed
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=');
        if base64_like {
            return STANDARD
                .decode(trimmed.as_bytes())
                .map_err(|error| AIError::InvalidRequest(format!("Invalid base64 image payload: {error}")));
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

        std::fs::read(&path).map_err(|error| {
            AIError::InvalidRequest(format!(
                "Failed to read reference image \"{}\": {}",
                path.to_string_lossy(),
                error
            ))
        })
    }

    fn map_dimensions(size: &str, aspect_ratio: &str) -> (i64, i64) {
        let longest_edge = match size.trim() {
            "2K" => 1536.0,
            "4K" => 2048.0,
            _ => 1024.0,
        };
        let ratio = aspect_ratio
            .split_once(':')
            .and_then(|(w, h)| Some((w.parse::<f64>().ok()?, h.parse::<f64>().ok()?)))
            .and_then(|(w, h)| if w > 0.0 && h > 0.0 { Some(w / h) } else { None })
            .unwrap_or(1.0)
            .clamp(0.25, 4.0);

        let (raw_width, raw_height) = if ratio >= 1.0 {
            (longest_edge, longest_edge / ratio)
        } else {
            (longest_edge * ratio, longest_edge)
        };
        let normalize = |value: f64| -> i64 {
            let rounded = (value / 64.0).round() * 64.0;
            rounded.clamp(256.0, 2048.0) as i64
        };
        (normalize(raw_width), normalize(raw_height))
    }

    fn set_text_input(workflow: &mut Map<String, Value>, node_id: &str, text: &str) {
        if let Some(inputs) = workflow
            .get_mut(node_id)
            .and_then(Value::as_object_mut)
            .and_then(|node| node.get_mut("inputs"))
            .and_then(Value::as_object_mut)
        {
            if inputs.contains_key("text") {
                inputs.insert("text".to_string(), json!(text));
            } else if inputs.contains_key("value") {
                inputs.insert("value".to_string(), json!(text));
            }
        }
    }

    fn set_number_input(workflow: &mut Map<String, Value>, node_id: &str, key_candidates: &[&str], value: Value) {
        if let Some(inputs) = workflow
            .get_mut(node_id)
            .and_then(Value::as_object_mut)
            .and_then(|node| node.get_mut("inputs"))
            .and_then(Value::as_object_mut)
        {
            for key in key_candidates {
                if inputs.contains_key(*key) {
                    inputs.insert((*key).to_string(), value.clone());
                    return;
                }
            }
            inputs.insert("value".to_string(), value);
        }
    }

    async fn upload_input_image(&self, base_url: &str, bytes: Vec<u8>) -> Result<String, AIError> {
        let part = multipart::Part::bytes(bytes)
            .file_name("input.png")
            .mime_str("image/png")
            .map_err(|error| AIError::Provider(format!("Failed to build upload payload: {error}")))?;
        let form = multipart::Form::new().part("image", part).text("overwrite", "true");
        let response = self
            .client
            .post(format!("{}/upload/image", base_url))
            .multipart(form)
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "ComfyUI image upload failed {}: {}",
                status, error_text
            )));
        }
        let payload = response.json::<ComfyUploadImageResponse>().await?;
        payload
            .name
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| AIError::Provider("ComfyUI upload response missing image name".to_string()))
    }
}

impl Default for ComfyUiProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for ComfyUiProvider {
    fn name(&self) -> &str {
        PROVIDER_ID
    }

    fn supports_model(&self, model: &str) -> bool {
        model.starts_with("comfyui/")
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String, AIError> {
        let runtime = request
            .runtime_config
            .ok_or_else(|| AIError::InvalidRequest("Missing ComfyUI runtime config".to_string()))?;
        let base_url = Self::normalize_base_url(&runtime.base_url);
        if base_url.is_empty() {
            return Err(AIError::InvalidRequest("ComfyUI base URL is required".to_string()));
        }
        if runtime.workflow_prompt_api_json.trim().is_empty() {
            return Err(AIError::InvalidRequest("ComfyUI workflow JSON is required".to_string()));
        }
        if runtime.output_node_id.trim().is_empty() {
            return Err(AIError::InvalidRequest("ComfyUI output node id is required".to_string()));
        }

        let mut workflow = serde_json::from_str::<Map<String, Value>>(&runtime.workflow_prompt_api_json)
            .map_err(|error| AIError::InvalidRequest(format!("Invalid ComfyUI workflow JSON: {error}")))?;

        for node_id in &runtime.positive_prompt_node_ids {
            Self::set_text_input(&mut workflow, node_id, &request.prompt);
        }

        if let Some(negative_prompt) = request
            .extra_params
            .as_ref()
            .and_then(|params| params.get("negative_prompt"))
            .and_then(Value::as_str)
        {
            for node_id in &runtime.negative_prompt_node_ids {
                Self::set_text_input(&mut workflow, node_id, negative_prompt);
            }
        }

        let (width, height) = Self::map_dimensions(&request.size, &request.aspect_ratio);
        if !runtime.image_input_node_id.trim().is_empty() {
            if let Some(reference_image) = request
                .reference_images
                .as_ref()
                .and_then(|items| items.first())
            {
                let bytes = Self::normalize_reference_image(reference_image)?;
                let image_name = self.upload_input_image(&base_url, bytes).await?;
                if let Some(inputs) = workflow
                    .get_mut(&runtime.image_input_node_id)
                    .and_then(Value::as_object_mut)
                    .and_then(|node| node.get_mut("inputs"))
                    .and_then(Value::as_object_mut)
                {
                    let field = if runtime.image_input_field.trim().is_empty() {
                        "image"
                    } else {
                        runtime.image_input_field.as_str()
                    };
                    inputs.insert(field.to_string(), json!(image_name));
                }
            }
        }

        if !runtime.width_node_id.trim().is_empty() {
            Self::set_number_input(&mut workflow, &runtime.width_node_id, &["width", "value"], json!(width));
        }
        if !runtime.height_node_id.trim().is_empty() {
            Self::set_number_input(&mut workflow, &runtime.height_node_id, &["height", "value"], json!(height));
        }
        if !runtime.seed_node_id.trim().is_empty() {
            let seed = request.extra_params.as_ref()
                .and_then(|p| p.get("seed"))
                .cloned()
                .unwrap_or_else(|| json!(rand_seed()));
            Self::set_number_input(&mut workflow, &runtime.seed_node_id, &["seed", "value"], seed);
        }
        if !runtime.steps_node_id.trim().is_empty() {
            if let Some(steps) = request.extra_params.as_ref().and_then(|p| p.get("steps")).cloned() {
                Self::set_number_input(&mut workflow, &runtime.steps_node_id, &["steps", "value"], steps);
            }
        }
        if !runtime.cfg_node_id.trim().is_empty() {
            if let Some(cfg) = request.extra_params.as_ref().and_then(|p| p.get("cfg")).cloned() {
                Self::set_number_input(&mut workflow, &runtime.cfg_node_id, &["cfg", "value"], cfg);
            }
        }
        if !runtime.denoise_node_id.trim().is_empty() {
            if let Some(denoise) = request.extra_params.as_ref().and_then(|p| p.get("denoise")).cloned() {
                Self::set_number_input(&mut workflow, &runtime.denoise_node_id, &["denoise", "value"], denoise);
            }
        }

        let prompt_response = self
            .client
            .post(format!("{}/prompt", base_url))
            .json(&json!({
                "client_id": uuid::Uuid::new_v4().to_string(),
                "prompt": workflow,
            }))
            .send()
            .await?;
        if !prompt_response.status().is_success() {
            let status = prompt_response.status();
            let error_text = prompt_response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "ComfyUI prompt request failed {}: {}",
                status, error_text
            )));
        }
        let prompt_payload = prompt_response.json::<ComfyPromptResponse>().await?;
        let prompt_id = prompt_payload
            .prompt_id
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AIError::Provider(
                    prompt_payload
                        .error
                        .unwrap_or_else(|| "ComfyUI prompt response missing prompt_id".to_string()),
                )
            })?;

        for _ in 0..120 {
            tokio::time::sleep(Duration::from_millis(1000)).await;
            let history_response = self
                .client
                .get(format!("{}/history/{}", base_url, prompt_id))
                .send()
                .await?;
            if !history_response.status().is_success() {
                continue;
            }
            let payload = history_response.json::<HashMap<String, ComfyHistoryItem>>().await?;
            let Some(history_item) = payload.get(&prompt_id) else {
                continue;
            };
            if let Some(outputs) = history_item.outputs.as_ref() {
                if let Some(output_node) = outputs.get(&runtime.output_node_id) {
                    if let Some(image) = output_node.images.as_ref().and_then(|items| items.first()) {
                        let filename = image.filename.clone().unwrap_or_default();
                        if !filename.trim().is_empty() {
                            let subfolder = image.subfolder.clone().unwrap_or_default();
                            let image_type = image.image_type.clone().unwrap_or_else(|| "output".to_string());
                            return Ok(format!(
                                "{}/view?filename={}&subfolder={}&type={}",
                                base_url,
                                urlencoding::encode(&filename),
                                urlencoding::encode(&subfolder),
                                urlencoding::encode(&image_type)
                            ));
                        }
                    }
                }
            }
            if let Some(status) = history_item
                .status
                .as_ref()
                .and_then(|value| value.status_str.as_deref())
            {
                if status.eq_ignore_ascii_case("error") {
                    return Err(AIError::Provider("ComfyUI workflow execution failed".to_string()));
                }
            }
        }

        Err(AIError::Provider("ComfyUI workflow timed out".to_string()))
    }
}
