use crate::proxy::providers::codex_oauth_auth::CodexOAuthManager;
use crate::proxy::providers::copilot_auth::CopilotAuthManager;
use crate::proxy::providers::xai_oauth_auth::XaiOAuthManager;
use crate::services::subscription::{CredentialStatus, SubscriptionQuota};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct CodexOAuthState(pub Arc<RwLock<CodexOAuthManager>>);

pub struct CopilotAuthState(pub Arc<RwLock<CopilotAuthManager>>);

pub struct XaiOAuthState(pub Arc<RwLock<XaiOAuthManager>>);

pub(crate) async fn query_xai_oauth_quota(
    state: &XaiOAuthState,
    account_id: Option<String>,
) -> Result<SubscriptionQuota, String> {
    let manager = state.0.read().await;
    let resolved = match account_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        Some(id) => Some(id.to_string()),
        None => manager.default_account_id().await,
    };
    let Some(id) = resolved else {
        return Ok(SubscriptionQuota::not_found("xai_oauth"));
    };

    let token = match manager.get_valid_token_for_account(&id).await {
        Ok(token) => token,
        Err(error) => {
            return Ok(SubscriptionQuota::error(
                "xai_oauth",
                CredentialStatus::Expired,
                format!("xAI OAuth token unavailable: {error}"),
            ));
        }
    };

    crate::services::subscription_grok::query_grok_quota(
        &token,
        "xai_oauth",
        "Please re-login via StackFerry.",
    )
    .await
}
