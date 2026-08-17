use crate::error::AppError;
use crate::provider::Provider;

pub(crate) fn write_provider_live(provider: &Provider) -> Result<(), AppError> {
    let object = provider
        .settings_config
        .as_object()
        .ok_or_else(|| AppError::Config("Codex 供应商配置必须是 JSON 对象".to_string()))?;
    let auth = object
        .get("auth")
        .ok_or_else(|| AppError::Config("Codex 供应商配置缺少 'auth' 字段".to_string()))?;
    let config = object.get("config").and_then(|value| value.as_str());
    let profile = crate::proxy::providers::resolve_codex_catalog_tool_profile(provider);

    crate::codex_config::write_codex_provider_live_with_catalog(
        &provider.settings_config,
        provider.category.as_deref(),
        auth,
        config,
        profile,
    )
}
