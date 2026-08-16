use serde_json::Value;

pub(crate) fn sanitize_settings_for_live(settings: &Value) -> Value {
    let mut value = settings.clone();
    if let Some(object) = value.as_object_mut() {
        object.remove("api_format");
        object.remove("apiFormat");
        object.remove("openrouter_compat_mode");
        object.remove("openrouterCompatMode");
    }
    value
}
