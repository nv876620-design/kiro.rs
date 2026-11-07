//! AWS Builder ID device authorization (SSO OIDC device-code flow).
//!
//! Used by the Admin UI's "Add AWS Builder ID" dialog:
//! 1. Register a public OIDC client (`/client/register`).
//! 2. Start device authorization (`/device_authorization`) → user code + verification URL.
//! 3. The user opens the verification URL in a normal browser and signs up / signs in
//!    with AWS Builder ID (the "https://us-east-1.signin.aws" style flow).
//! 4. The backend polls `/token` until the grant completes, then imports the result
//!    (refreshToken + clientId + clientSecret) as an `idc` credential.
//!
//! The request/response shapes mirror the `@aws-sdk/client-sso-oidc` calls that
//! `refresh_idc_token` uses, so a credential added this way refreshes exactly like
//! an IdC credential imported from a KAM export.

use serde::{Deserialize, Serialize};

use std::collections::HashMap;

use crate::http_client::ProxyConfig;
use crate::model::config::Config;

/// AWS SSO portal start URL (issuer for the OIDC client registration).
pub const SSO_START_URL: &str = "https://view.awsapps.com/start";

/// Codewhisperer scopes requested for the client (same set the Kiro IDE requests).
const CLIENT_SCOPES: [&str; 5] = [
    "codewhisperer:analysis",
    "codewhisperer:completions",
    "codewhisperer:conversations",
    "codewhisperer:taskassist",
    "codewhisperer:transformations",
];

/// OIDC client registration response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientRegistration {
    pub client_id: String,
    pub client_secret: String,
}

/// Device authorization response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthorization {
    pub device_code: String,
    pub user_code: String,
    /// Human-friendly verification URL (without the user code pre-filled).
    pub verification_uri: String,
    /// Verification URL with the user code pre-filled (open this one).
    pub verification_uri_complete: String,
    /// Seconds until the user code expires.
    pub expires_in: i64,
    /// Minimum polling interval in seconds.
    #[serde(default = "default_poll_interval")]
    pub interval: u64,
}

fn default_poll_interval() -> u64 {
    5
}

/// Successful token exchange.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTokenSet {
    pub access_token: String,
    pub refresh_token: String,
    #[serde(default)]
    pub expires_in: Option<i64>,
}

/// Outcome of a single `/token` poll attempt.
#[derive(Debug)]
pub enum DeviceTokenPoll {
    /// Grant completed.
    Success(DeviceTokenSet),
    /// The user has not finished authorizing yet.
    Pending,
    /// Server asked to slow down the polling interval.
    SlowDown,
    /// Non-recoverable failure (expired code, access denied, network error, ...).
    Failed(String),
}

/// AWS OIDC `x-amz-user-agent` / `user-agent` pair, mirroring `refresh_idc_token`.
fn oidc_user_agents(config: &Config) -> (String, String) {
    let sso_oidc_ver = config.effective_sso_oidc_sdk_version();
    (
        format!("aws-sdk-js/{} KiroIDE", sso_oidc_ver),
        format!(
            "aws-sdk-js/{} ua/2.1 os/{} lang/js md/nodejs#{} api/sso-oidc#{} m/E KiroIDE",
            sso_oidc_ver, config.system_version, config.node_version, sso_oidc_ver
        ),
    )
}

/// Common request builder for the SSO OIDC endpoints. `path` is appended to
/// `https://oidc.<region>.amazonaws.com`.
fn oidc_request(
    client: &reqwest::Client,
    region: &str,
    config: &Config,
    path: &str,
) -> reqwest::RequestBuilder {
    let (x_amz_ua, ua) = oidc_user_agents(config);
    client
        .post(format!("https://oidc.{region}.amazonaws.com{path}"))
        .header("content-type", "application/json")
        .header("x-amz-user-agent", x_amz_ua)
        .header("user-agent", ua)
        .header("amz-sdk-invocation-id", uuid::Uuid::new_v4().to_string())
        .header("amz-sdk-request", "attempt=1; max=1")
        .header("Connection", "close")
}

/// Step 1: register a public OIDC client for the device-code grant.
pub async fn register_oidc_client(
    client: &reqwest::Client,
    region: &str,
    config: &Config,
) -> anyhow::Result<ClientRegistration> {
    let body = serde_json::json!({
        "clientName": "kiro-rs",
        "clientType": "public",
        "scopes": CLIENT_SCOPES,
        "grantTypes": [
            "urn:ietf:params:oauth:grant-type:device_code",
            "refresh_token"
        ],
        "issuerUrl": SSO_START_URL,
    });

    let response = oidc_request(client, region, config, "/client/register")
        .body(body.to_string())
        .send()
        .await?;

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        anyhow::bail!("OIDC client register failed: {} {}", status, body_text);
    }
    serde_json::from_str::<ClientRegistration>(&body_text)
        .map_err(|e| anyhow::anyhow!("OIDC client register response invalid: {e}"))
}

/// Step 2: start device authorization and return the user code + verification URLs.
pub async fn start_device_authorization(
    client: &reqwest::Client,
    region: &str,
    config: &Config,
    client_id: &str,
    client_secret: &str,
) -> anyhow::Result<DeviceAuthorization> {
    let body = serde_json::json!({
        "clientId": client_id,
        "clientSecret": client_secret,
        "startUrl": SSO_START_URL,
    });

    let response = oidc_request(client, region, config, "/device_authorization")
        .body(body.to_string())
        .send()
        .await?;

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        anyhow::bail!("Device authorization failed: {} {}", status, body_text);
    }
    serde_json::from_str::<DeviceAuthorization>(&body_text)
        .map_err(|e| anyhow::anyhow!("Device authorization response invalid: {e}"))
}

/// One `/token` poll attempt for the device-code grant.
pub async fn poll_device_token(
    client: &reqwest::Client,
    region: &str,
    config: &Config,
    client_id: &str,
    client_secret: &str,
    device_code: &str,
) -> DeviceTokenPoll {
    let body = serde_json::json!({
        "clientId": client_id,
        "clientSecret": client_secret,
        "grantType": "urn:ietf:params:oauth:grant-type:device_code",
        "deviceCode": device_code,
    });

    let response = match oidc_request(client, region, config, "/token")
        .body(body.to_string())
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => return DeviceTokenPoll::Failed(format!("Token poll request failed: {e}")),
    };

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();

    if status.is_success() {
        return match serde_json::from_str::<DeviceTokenSet>(&body_text) {
            Ok(tokens) => DeviceTokenPoll::Success(tokens),
            Err(e) => DeviceTokenPoll::Failed(format!("Token response invalid: {e}")),
        };
    }

    match status.as_u16() {
        400 => {
            let error = serde_json::from_str::<serde_json::Value>(&body_text)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
                .unwrap_or_default();
            match error.as_str() {
                "authorization_pending" => DeviceTokenPoll::Pending,
                "slow_down" => DeviceTokenPoll::SlowDown,
                _ => DeviceTokenPoll::Failed(format!("Token poll failed: {error}")),
            }
        }
        _ => DeviceTokenPoll::Failed(format!("Token poll failed: {} {}", status, body_text)),
    }
}

/// Global proxy configuration from `config.json` (used for the OIDC calls so the
/// device flow goes through the same network path as token refreshes).
pub fn global_proxy_config(config: &Config) -> Option<ProxyConfig> {
    let url = config.proxy_url.as_deref()?.trim();
    if url.is_empty() {
        return None;
    }
    let mut proxy = ProxyConfig::new(url);
    if let (Some(user), Some(pass)) = (&config.proxy_username, &config.proxy_password) {
        if !user.is_empty() {
            proxy = proxy.with_auth(user.clone(), pass.clone());
        }
    }
    Some(proxy)
}

/// Device authorization session tracked between the "start" call and the final token.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthSession {
    pub session_id: String,
    pub status: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_at: i64,
    pub interval_secs: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// In-memory store of device authorization sessions (keyed by session id).
#[derive(Default)]
pub struct DeviceAuthStore(parking_lot::Mutex<HashMap<String, DeviceAuthSession>>);

impl DeviceAuthStore {
    pub fn new() -> Self {
        Self(parking_lot::Mutex::new(HashMap::new()))
    }

    pub fn insert(&self, session: DeviceAuthSession) {
        self.0.lock().insert(session.session_id.clone(), session);
    }

    pub fn get(&self, session_id: &str) -> Option<DeviceAuthSession> {
        self.0.lock().get(session_id).cloned()
    }

    pub fn update<F: FnOnce(&mut DeviceAuthSession)>(&self, session_id: &str, f: F) {
        if let Some(session) = self.0.lock().get_mut(session_id) {
            f(session);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_authorization_parses_aws_response() {
        let raw = serde_json::json!({
            "deviceCode": "dc",
            "userCode": "ABCD-EFGH",
            "verificationUri": "https://view.awsapps.com/start#/device",
            "verificationUriComplete": "https://view.awsapps.com/start#/device?user_code=ABCD-EFGH",
            "expiresIn": 600,
            "interval": 5
        });
        let parsed: DeviceAuthorization = serde_json::from_value(raw).unwrap();
        assert_eq!(parsed.user_code, "ABCD-EFGH");
        assert_eq!(parsed.interval, 5);
        assert_eq!(parsed.expires_in, 600);
    }

    #[test]
    fn device_authorization_uses_default_interval() {
        let raw = serde_json::json!({
            "deviceCode": "dc",
            "userCode": "ABCD-EFGH",
            "verificationUri": "u",
            "verificationUriComplete": "uc",
            "expiresIn": 600
        });
        let parsed: DeviceAuthorization = serde_json::from_value(raw).unwrap();
        assert_eq!(parsed.interval, 5);
    }

    #[test]
    fn session_store_roundtrip_and_update() {
        let store = DeviceAuthStore::new();
        let session = DeviceAuthSession {
            session_id: "s1".to_string(),
            status: "pending".to_string(),
            user_code: "ABCD-EFGH".to_string(),
            verification_uri: "u".to_string(),
            verification_uri_complete: "uc".to_string(),
            expires_at: 100,
            interval_secs: 5,
            credential_id: None,
            error: None,
        };
        store.insert(session);
        assert_eq!(store.get("s1").unwrap().status, "pending");
        store.update("s1", |s| {
            s.status = "authorized".to_string();
            s.credential_id = Some(42);
        });
        let updated = store.get("s1").unwrap();
        assert_eq!(updated.status, "authorized");
        assert_eq!(updated.credential_id, Some(42));
        assert!(store.get("missing").is_none());
    }
}

/// Build the HTTP client used by the device flow.
pub fn build_device_http_client(config: &Config) -> anyhow::Result<reqwest::Client> {
    crate::http_client::build_client(
        global_proxy_config(config).as_ref(),
        60,
        config.tls_backend,
    )
}
