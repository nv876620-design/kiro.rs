//! ListAvailableModels API 调用
//!
//! 从 Kiro API 获取可用模型列表

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::http_client::{build_client, ProxyConfig};
use crate::kiro::machine_id;
use crate::kiro::model::credentials::KiroCredentials;
use crate::model::config::Config;

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KiroModel {
    pub model_id: String,
    pub model_name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported_input_types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_limits: Option<TokenLimits>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_multiplier: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_unit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenLimits {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u64>,
}

/// ListAvailableModels 响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListModelsResponse {
    models: Vec<KiroModel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_token: Option<String>,
}

/// 获取 Q Service 端点
fn get_q_service_endpoint(region: &str) -> String {
    format!("https://q.{}.amazonaws.com", region)
}

/// 从 Kiro API 获取可用模型列表
pub async fn fetch_kiro_models(
    credentials: &KiroCredentials,
    token: &str,
    region: Option<&str>,
    config: &Config,
    proxy: Option<&ProxyConfig>,
) -> Result<Vec<KiroModel>> {
    let region = region.unwrap_or("us-east-1");
    let base_url = get_q_service_endpoint(region);

    let machine_id = machine_id::generate_from_credentials(credentials, config);
    let kiro_version = &config.kiro_version;

    let user_agent = format!(
        "aws-sdk-js/1.0.18 ua/2.1 os/windows lang/js md/nodejs#20.16.0 api/codewhispererstreaming#1.0.18 m/E KiroIDE-{}-{}",
        kiro_version, machine_id
    );
    let amz_user_agent = format!(
        "aws-sdk-js/1.0.18 KiroIDE {} {}",
        kiro_version, machine_id
    );

    let client = build_client(proxy, 60, config.tls_backend)?;

    let has_profile_arn = credentials
        .profile_arn
        .as_deref()
        .map(str::trim)
        .is_some_and(|s| !s.is_empty());

    // 优先不带 profileArn 查询（与 Kiro-account-manager 一致），如果失败且配置了 profile_arn 则尝试带 profileArn
    let attempts = if has_profile_arn {
        vec![false, true]
    } else {
        vec![false]
    };

    let mut last_error = None;
    for with_profile_arn in attempts {
        match fetch_kiro_models_internal(
            &client,
            &base_url,
            token,
            &user_agent,
            &amz_user_agent,
            credentials,
            with_profile_arn,
        )
        .await
        {
            Ok(models) if !models.is_empty() => return Ok(models),
            Ok(models) => return Ok(models),
            Err(e) => {
                tracing::debug!(
                    "ListAvailableModels (with_profile_arn={}) failed: {}",
                    with_profile_arn,
                    e
                );
                last_error = Some(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("No models returned")))
}

async fn fetch_kiro_models_internal(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    user_agent: &str,
    amz_user_agent: &str,
    credentials: &KiroCredentials,
    include_profile_arn: bool,
) -> Result<Vec<KiroModel>> {
    let mut all_models = Vec::new();
    let mut next_token: Option<String> = None;

    loop {
        let mut params = vec![
            ("origin", "AI_EDITOR"),
            ("maxResults", "50"),
        ];

        if include_profile_arn {
            if let Some(profile_arn) = &credentials.profile_arn {
                let trimmed = profile_arn.trim();
                if !trimmed.is_empty() {
                    params.push(("profileArn", trimmed));
                }
            }
        }

        let url = if let Some(token_param) = &next_token {
            format!(
                "{}/ListAvailableModels?{}&nextToken={}",
                base_url,
                serde_urlencoded::to_string(&params)?,
                urlencoding::encode(token_param)
            )
        } else {
            format!(
                "{}/ListAvailableModels?{}",
                base_url,
                serde_urlencoded::to_string(&params)?
            )
        };

        let mut request = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("User-Agent", user_agent)
            .header("x-amz-user-agent", amz_user_agent)
            .header("x-amzn-codewhisperer-optout", "true");

        if credentials.is_api_key_credential() {
            request = request.header("TokenType", "API_KEY");
        }

        let response = request
            .send()
            .await
            .context("Failed to send request to ListAvailableModels")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            bail!("ListAvailableModels failed with status {}: {}", status, body);
        }

        let data: ListModelsResponse = response
            .json()
            .await
            .context("Failed to parse ListAvailableModels response")?;

        all_models.extend(data.models);

        if data.next_token.is_none() {
            break;
        }
        next_token = data.next_token;
    }

    Ok(all_models)
}
