use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::info;

use crate::ai::error::AIError;
use crate::ai::{AIProvider, GenerateRequest, ProviderRuntimeConfig};

const DEFAULT_BASE_URL: &str = "http://aiinone.seasungame.com:8000";
const POLL_INTERVAL_MS: u64 = 3000;
const MAX_POLL_ATTEMPTS: u32 = 120;
fn encode_image(source: &str) -> Option<String> {
    let trimmed = source.trim();
    if trimmed.starts_with("data:") {
        return trimmed.split(",").nth(1).map(|s| s.to_string());
    }
    let raw = trimmed.trim_start_matches("file://");
    let decoded = urlencoding::decode(raw)
        .map(|r| r.into_owned())
        .unwrap_or_else(|_| raw.to_string());
    let path = if decoded.starts_with("/") && decoded.len() > 2 && decoded.as_bytes().get(2) == Some(&58u8) {
        decoded[1..].to_string()
    } else { decoded };
    std::fs::read(&path).ok().map(|b| STANDARD.encode(&b))
}

pub struct TcNanoBanaProvider {
    client: Client,
    api_key: Arc<RwLock<Option<String>>>,
    base_url: Arc<RwLock<String>>,
}

impl TcNanoBanaProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            api_key: Arc::new(RwLock::new(None)),
            base_url: Arc::new(RwLock::new(DEFAULT_BASE_URL.to_string())),
        }
    }
}

impl Default for TcNanoBanaProvider {
    fn default() -> Self { Self::new() }
}
#[async_trait::async_trait]
impl AIProvider for TcNanoBanaProvider {
    fn name(&self) -> &str { "tcnanobana" }

    fn supports_model(&self, model: &str) -> bool { model.starts_with("tcnanobana/") }

    fn list_models(&self) -> Vec<String> { vec\!["tcnanobana/gemini-2.5-flash-image".to_string()] }

    async fn set_api_key(&self, api_key: String) -> Result<(), AIError> {
        let mut key = self.api_key.write().await;
        *key = if api_key.trim().is_empty() { None } else { Some(api_key.trim().to_string()) };
        Ok(())
    }

    async fn configure_runtime(&self, config: ProviderRuntimeConfig) -> Result<(), AIError> {
        self.set_api_key(config.api_key).await?;
        if let Some(ref url) = config.base_url {
            if \!url.trim().is_empty() {
                let mut stored = self.base_url.write().await;
                *stored = url.trim().trim_end_matches("/").to_string();
            }
        }
        Ok(())
    }
    async fn generate(&self, request: GenerateRequest) -> Result<String, AIError> {
        let api_key: String = match request.runtime_config.as_ref() {
            Some(rc) if \!rc.api_key.trim().is_empty() => rc.api_key.trim().to_string(),
            _ => self.api_key.read().await.clone()
                .ok_or_else(|| AIError::InvalidRequest("TC Nano Banana API key not set".to_string()))?,
        };
        let base_url = match request.runtime_config.as_ref() {
            Some(rc) if \!rc.base_url.trim().is_empty() => rc.base_url.trim().trim_end_matches("/").to_string(),
            _ => self.base_url.read().await.clone(),
        };
        let mut parts: Vec<Value> = vec\![json\!({"text": request.prompt})];
        if let Some(ref images) = request.reference_images {
            for src in images {
                if let Some(b64) = encode_image(src) {
                    parts.push(json\!({"inlineData":{"mimeType":"image/png","data":b64}}));
                }
            }
        }
        let body = json\!({
            "model": "gemini-2.5-flash-image-preview",
            "data": {
                "contents": [{"role":"user","parts":parts}],
                "generationConfig": {
                    "responseModalities": ["TEXT","IMAGE"],
                    "temperature": 0.8,
                    "maxOutputTokens": 8192,
                    "aspect_ratio": request.aspect_ratio,
                    "resolution": request.size
                }
            }
        });
        let create_url = format\!("{}/ai_in_one/v2/createImage", base_url);
        info\!("[TCNanoBanana] POST {}", create_url);
        let resp = self.client.post(&create_url)
            .header("Authorization", format\!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body).send().await?;
        if \!resp.status().is_success() {
            let s = resp.status();
            let t = resp.text().await.unwrap_or_default();
            return Err(AIError::Provider(format\!("TCNanoBanana createImage failed {}: {}", s, t)));
        }
        let rj: Value = resp.json().await?;
        let task_id = rj["data"]["id"].as_str()
            .ok_or_else(|| AIError::Provider("TCNanoBanana: missing task id".to_string()))?
            .to_string();
        info\!("[TCNanoBanana] task_id={}", task_id);
        let query_url = format!("{}/ai_in_one/v2/queryImage", base_url);
        for attempt in 0..MAX_POLL_ATTEMPTS {
            sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
            let pr = self.client.post(&query_url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&json!({"id": task_id})).send().await?;
            if !pr.status().is_success() {
                let s = pr.status();
                let t = pr.text().await.unwrap_or_default();
                return Err(AIError::Provider(format!("TCNanoBanana queryImage failed {}: {}", s, t)));
            }
            let pj: Value = pr.json().await?;
            let status = pj["data"]["status"].as_str().unwrap_or("unknown");
            info!("[TCNanoBanana] poll {}/{} status={}", attempt+1, MAX_POLL_ATTEMPTS, status);
            match status {
                "SUCCESS" | "success" | "completed" => {
                    if let Some(b64) = pj["data"]["candidates"].as_array()
                        .and_then(|a| a.first())
                        .and_then(|c| c["content"]["parts"].as_array())
                        .and_then(|ps| ps.iter().find(|p| p["inlineData"].is_object()))
                        .and_then(|p| p["inlineData"]["data"].as_str())
                    { return Ok(format!("data:image/png;base64,{}", b64)); }
                    if let Some(uri) = pj["data"]["candidates"].as_array()
                        .and_then(|a| a.first())
                        .and_then(|c| c["content"]["parts"].as_array())
                        .and_then(|ps| ps.iter().find(|p| p["fileData"].is_object()))
                        .and_then(|p| p["fileData"]["fileUri"].as_str())
                    { return Ok(uri.to_string()); }
                    return Err(AIError::Provider("TCNanoBanana: no image in result".to_string()));
                }
                "FAILED" | "failed" | "error" => {
                    let msg = pj["data"]["error"].as_str().unwrap_or("unknown");
                    return Err(AIError::Provider(format!("TCNanoBanana task failed: {}", msg)));
                }
                _ => {}
            }
        }
        Err(AIError::Provider(format!("TCNanoBanana task {} timed out", task_id)))
    }
}
