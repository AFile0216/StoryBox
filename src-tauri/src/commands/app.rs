use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use reqwest::header;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

fn default_theme_contrast_preset() -> String {
    "balanced".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppSettings {
    pub custom_api_interfaces: Vec<serde_json::Value>,
    pub comfy_ui: serde_json::Value,
    pub provider_routes: Vec<serde_json::Value>,
    pub auto_check_app_update_on_launch: bool,
    pub enable_update_dialog: bool,
    pub version_feed: serde_json::Value,
    pub download_preset_paths: Vec<String>,
    pub use_upload_filename_as_node_title: bool,
    pub storyboard_gen_keep_style_consistent: bool,
    pub storyboard_gen_disable_text_in_image: bool,
    pub storyboard_gen_auto_infer_empty_frame: bool,
    pub ignore_at_tag_when_copying_and_generating: bool,
    pub enable_storyboard_gen_grid_preview_shortcut: bool,
    pub show_storyboard_gen_advanced_ratio_controls: bool,
    pub ui_radius_preset: String,
    pub theme_tone_preset: String,
    #[serde(default = "default_theme_contrast_preset")]
    pub theme_contrast_preset: String,
    pub accent_color: String,
    pub canvas_edge_routing_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapDirectories {
    pub app_data_dir: String,
    pub app_config_dir: String,
    pub cache_dir: String,
    pub log_dir: String,
    pub projects_dir: String,
    pub media_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapAppResult {
    pub app_version: String,
    pub directories: BootstrapDirectories,
    pub settings: Option<PersistedAppSettings>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealthCheckResult {
    pub provider_kind: String,
    pub status: String,
    pub message: String,
    pub checked_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionCheckResult {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub source: String,
    pub latest_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubLatestReleaseResponse {
    tag_name: Option<String>,
    html_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomVersionFeedResponse {
    version: Option<String>,
    url: Option<String>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn normalize_base_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches(['v', 'V']).to_string()
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let parse = |value: &str| -> Vec<i64> {
        normalize_version(value)
            .split('-')
            .next()
            .unwrap_or_default()
            .split('.')
            .map(|part| part.parse::<i64>().unwrap_or(0))
            .collect()
    };

    let left_parts = parse(left);
    let right_parts = parse(right);
    let max_len = left_parts.len().max(right_parts.len());
    for index in 0..max_len {
        let left_value = *left_parts.get(index).unwrap_or(&0);
        let right_value = *right_parts.get(index).unwrap_or(&0);
        match left_value.cmp(&right_value) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }
    std::cmp::Ordering::Equal
}

fn resolve_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve app config dir: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create app config dir: {error}"))?;
    Ok(dir)
}

fn resolve_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create app data dir: {error}"))?;
    Ok(dir)
}

fn resolve_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve cache dir: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create cache dir: {error}"))?;
    Ok(dir)
}

fn resolve_log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| resolve_app_data_dir(app).unwrap_or_else(|_| std::env::temp_dir()).join("logs"));
    fs::create_dir_all(&log_dir).map_err(|error| format!("Failed to create log dir: {error}"))?;
    Ok(log_dir)
}

fn resolve_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_app_config_dir(app)?.join("settings.json"))
}

fn read_settings_file(app: &AppHandle) -> Result<Option<PersistedAppSettings>, String> {
    let settings_path = resolve_settings_path(app)?;
    if !settings_path.is_file() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&settings_path)
        .map_err(|error| format!("Failed to read settings file: {error}"))?;
    let parsed = serde_json::from_str::<PersistedAppSettings>(&raw)
        .map_err(|error| format!("Failed to parse settings file: {error}"))?;
    Ok(Some(parsed))
}

fn write_settings_file(app: &AppHandle, settings: &PersistedAppSettings) -> Result<(), String> {
    let settings_path = resolve_settings_path(app)?;
    let payload = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Failed to encode settings file: {error}"))?;
    fs::write(settings_path, payload).map_err(|error| format!("Failed to write settings file: {error}"))
}

async fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("Failed to build http client: {error}"))
}

#[tauri::command]
pub fn bootstrap_app(app: AppHandle) -> Result<BootstrapAppResult, String> {
    let app_data_dir = resolve_app_data_dir(&app)?;
    let app_config_dir = resolve_app_config_dir(&app)?;
    let cache_dir = resolve_cache_dir(&app)?;
    let log_dir = resolve_log_dir(&app)?;
    let projects_dir = app_data_dir.join("projects");
    let media_dir = app_data_dir.join("media");

    fs::create_dir_all(&projects_dir)
        .map_err(|error| format!("Failed to create projects dir: {error}"))?;
    fs::create_dir_all(&media_dir)
        .map_err(|error| format!("Failed to create media dir: {error}"))?;

    Ok(BootstrapAppResult {
        app_version: app.package_info().version.to_string(),
        directories: BootstrapDirectories {
            app_data_dir: app_data_dir.to_string_lossy().to_string(),
            app_config_dir: app_config_dir.to_string_lossy().to_string(),
            cache_dir: cache_dir.to_string_lossy().to_string(),
            log_dir: log_dir.to_string_lossy().to_string(),
            projects_dir: projects_dir.to_string_lossy().to_string(),
            media_dir: media_dir.to_string_lossy().to_string(),
        },
        settings: read_settings_file(&app)?,
    })
}

#[tauri::command]
pub fn load_app_settings(app: AppHandle) -> Result<Option<PersistedAppSettings>, String> {
    read_settings_file(&app)
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: PersistedAppSettings) -> Result<(), String> {
    write_settings_file(&app, &settings)
}

#[tauri::command]
pub async fn check_provider_health(
    provider_kind: String,
    base_url: String,
) -> Result<ProviderHealthCheckResult, String> {
    let checked_at = now_ms();
    let normalized_base_url = normalize_base_url(&base_url);
    if normalized_base_url.is_empty() {
        return Ok(ProviderHealthCheckResult {
            provider_kind,
            status: "error".to_string(),
            message: "Base URL is required".to_string(),
            checked_at,
        });
    }

    let endpoint = if provider_kind == "comfyui" {
        format!("{}/system_stats", normalized_base_url)
    } else {
        format!("{}/models", normalized_base_url)
    };

    let client = build_http_client().await?;
    match client.get(endpoint).send().await {
        Ok(response) => {
            let status_code = response.status();
            let healthy =
                status_code.is_success() || status_code.as_u16() == 401 || status_code.as_u16() == 403;
            Ok(ProviderHealthCheckResult {
                provider_kind,
                status: if healthy { "healthy" } else { "unreachable" }.to_string(),
                message: if healthy {
                    format!("Connected: HTTP {}", status_code.as_u16())
                } else {
                    format!("Request failed: HTTP {}", status_code.as_u16())
                },
                checked_at,
            })
        }
        Err(error) => Ok(ProviderHealthCheckResult {
            provider_kind,
            status: "error".to_string(),
            message: error.to_string(),
            checked_at,
        }),
    }
}

#[tauri::command]
pub async fn check_app_version(
    app: AppHandle,
    source: String,
    github_repo: Option<String>,
    custom_feed_url: Option<String>,
) -> Result<AppVersionCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let normalized_source = source.trim().to_lowercase();
    let client = build_http_client().await?;

    if normalized_source == "custom" {
        let feed_url = custom_feed_url
            .unwrap_or_default()
            .trim()
            .to_string();
        if feed_url.is_empty() {
            return Err("Custom version feed URL is required".to_string());
        }

        let response = client
            .get(feed_url.clone())
            .header(header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| format!("Custom version feed request failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Custom version feed request failed with status {}",
                response.status()
            ));
        }

        let payload = response
            .json::<CustomVersionFeedResponse>()
            .await
            .map_err(|error| format!("Failed to decode custom version feed: {error}"))?;
        let latest_version = payload.version.map(|value| normalize_version(&value));
        let has_update = latest_version
            .as_deref()
            .map(|value| compare_versions(value, &current_version) == std::cmp::Ordering::Greater)
            .unwrap_or(false);

        return Ok(AppVersionCheckResult {
            current_version,
            latest_version,
            has_update,
            source: "custom".to_string(),
            latest_url: payload.url,
        });
    }

    let repo = github_repo
        .unwrap_or_else(|| "AFile0216/StoryBox".to_string())
        .trim()
        .to_string();
    if repo.is_empty() {
        return Err("GitHub repo is required".to_string());
    }

    let endpoint = format!("https://api.github.com/repos/{repo}/releases/latest");
    let response = client
        .get(endpoint)
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header(header::USER_AGENT, "Storyboard-Copilot-VersionCheck")
        .send()
        .await
        .map_err(|error| format!("GitHub version request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub version request failed with status {}",
            response.status()
        ));
    }

    let payload = response
        .json::<GithubLatestReleaseResponse>()
        .await
        .map_err(|error| format!("Failed to decode GitHub release payload: {error}"))?;
    let latest_version = payload.tag_name.map(|value| normalize_version(&value));
    let has_update = latest_version
        .as_deref()
        .map(|value| compare_versions(value, &current_version) == std::cmp::Ordering::Greater)
        .unwrap_or(false);

    Ok(AppVersionCheckResult {
        current_version,
        latest_version,
        has_update,
        source: "github".to_string(),
        latest_url: payload.html_url,
    })
}
