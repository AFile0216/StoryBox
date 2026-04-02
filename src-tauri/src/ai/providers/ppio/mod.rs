mod adapter;
mod models;
mod registry;

use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::ai::error::AIError;
use crate::ai::{AIProvider, ProviderRuntimeConfig};

use registry::PPIOModelRegistry;

pub struct PPIOProvider {
    client: Client,
    api_key: Arc<RwLock<Option<String>>>,
    base_url: Arc<RwLock<String>>,
    model_registry: PPIOModelRegistry,
}

const DEFAULT_BASE_URL: &str = "https://api.ppio.com";

#[derive(Debug, Deserialize)]
struct ImageResponse {
    image_urls: Vec<String>,
}

impl PPIOProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            api_key: Arc::new(RwLock::new(None)),
            base_url: Arc::new(RwLock::new(DEFAULT_BASE_URL.to_string())),
            model_registry: PPIOModelRegistry::new(),
        }
    }

    pub async fn set_api_key(&self, api_key: String) {
        let mut key = self.api_key.write().await;
        let normalized = api_key.trim().to_string();
        *key = if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        };
    }

    pub async fn get_api_key(&self) -> Option<String> {
        let key = self.api_key.read().await;
        key.clone()
    }
}

impl Default for PPIOProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for PPIOProvider {
    fn name(&self) -> &str {
        "ppio"
    }

    fn supports_model(&self, model: &str) -> bool {
        self.model_registry.supports(model)
    }

    fn list_models(&self) -> Vec<String> {
        self.model_registry.list_models()
    }

    async fn set_api_key(&self, api_key: String) -> Result<(), AIError> {
        PPIOProvider::set_api_key(self, api_key).await;
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

    async fn generate(&self, request: crate::ai::GenerateRequest) -> Result<String, AIError> {
        let key = self.api_key.read().await;
        let api_key = key
            .as_ref()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;

        let adapter = self
            .model_registry
            .resolve(&request.model)
            .ok_or_else(|| AIError::ModelNotSupported(request.model.clone()))?;

        let base_url = self.base_url.read().await.clone();
        let prepared = adapter.build_request(&request, &base_url)?;

        info!("[PPIO Request] {}", prepared.summary);
        info!("[PPIO API] URL: {}", prepared.endpoint);

        let response = self
            .client
            .post(&prepared.endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&prepared.body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AIError::Provider(format!(
                "API error {}: {}",
                status, error_text
            )));
        }

        let result: ImageResponse = response.json().await?;

        if let Some(image_url) = result.image_urls.first() {
            info!("Generated image: {}", image_url);
            Ok(image_url.clone())
        } else {
            Err(AIError::Provider("No image URL in response".to_string()))
        }
    }
}
