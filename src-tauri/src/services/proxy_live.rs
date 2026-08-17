use serde_json::{json, Value};

use crate::config::{get_claude_settings_path, read_json_file, write_json_file};

pub(crate) fn read_claude() -> Result<Value, String> {
    let path = get_claude_settings_path();
    if !path.exists() {
        return Err("Claude 配置文件不存在".to_string());
    }

    let mut value: Value =
        read_json_file(&path).map_err(|error| format!("读取 Claude 配置失败: {error}"))?;

    if value.is_null() {
        value = json!({});
    }

    if !value.is_object() {
        let kind = match &value {
            Value::Null => "null",
            Value::Bool(_) => "boolean",
            Value::Number(_) => "number",
            Value::String(_) => "string",
            Value::Array(_) => "array",
            Value::Object(_) => "object",
        };
        return Err(format!(
            "Claude 配置文件格式错误：根节点必须是 JSON 对象（当前为 {kind}），路径: {}",
            path.display()
        ));
    }

    Ok(value)
}

pub(crate) fn write_claude(config: &Value) -> Result<(), String> {
    let path = get_claude_settings_path();
    let settings = crate::services::provider::sanitize_claude_settings_for_live(config);
    write_json_file(&path, &settings).map_err(|error| format!("写入 Claude 配置失败: {error}"))
}
