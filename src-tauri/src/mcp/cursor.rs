use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::app_config::{McpApps, McpServer, MultiAppConfig};
use crate::error::AppError;

use super::validation::normalize_server_spec;

fn config_path() -> PathBuf {
    crate::config::get_home_dir()
        .join(".cursor")
        .join("mcp.json")
}

pub fn import_from_cursor(config: &mut MultiAppConfig) -> Result<usize, AppError> {
    let path = config_path();
    if !path.exists() {
        return Ok(0);
    }
    let content = std::fs::read_to_string(&path).map_err(|error| AppError::io(&path, error))?;
    let root: Value = json5::from_str(&content).map_err(|error| {
        AppError::Config(format!(
            "解析 Cursor MCP 配置 {} 失败: {error}",
            path.display()
        ))
    })?;
    let Some(entries) = root.get("mcpServers").and_then(Value::as_object) else {
        return Ok(0);
    };

    let servers = config.mcp.servers.get_or_insert_with(HashMap::new);
    let mut changed = 0;
    for (id, spec) in entries {
        let spec = match normalize_server_spec(spec) {
            Ok(spec) => spec,
            Err(error) => {
                log::warn!("跳过无效 Cursor MCP 服务器 '{id}': {error}");
                continue;
            }
        };
        if servers.contains_key(id) {
            continue;
        }
        servers.insert(
            id.clone(),
            McpServer {
                id: id.clone(),
                name: id.clone(),
                server: spec,
                apps: McpApps::default(),
                description: None,
                homepage: None,
                docs: None,
                tags: vec!["cursor".to_string()],
            },
        );
        changed += 1;
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct TestHomeGuard(Option<std::ffi::OsString>);

    impl TestHomeGuard {
        fn set(home: &std::path::Path) -> Self {
            let previous = std::env::var_os("STACKFERRY_TEST_HOME");
            std::env::set_var("STACKFERRY_TEST_HOME", home);
            Self(previous)
        }
    }

    impl Drop for TestHomeGuard {
        fn drop(&mut self) {
            match self.0.take() {
                Some(value) => std::env::set_var("STACKFERRY_TEST_HOME", value),
                None => std::env::remove_var("STACKFERRY_TEST_HOME"),
            }
        }
    }

    #[test]
    #[serial_test::serial]
    fn imports_cursor_servers_without_enabling_an_agent_projection() {
        let temp = tempfile::tempdir().expect("tempdir");
        let _guard = TestHomeGuard::set(temp.path());
        let dir = temp.path().join(".cursor");
        std::fs::create_dir_all(&dir).expect("create cursor dir");
        std::fs::write(
            dir.join("mcp.json"),
            serde_json::to_vec(&json!({
                "mcpServers": {
                    "playwright": {
                        "command": "npx",
                        "args": ["@playwright/mcp"]
                    }
                }
            }))
            .expect("serialize config"),
        )
        .expect("write config");

        let mut config = MultiAppConfig::default();
        assert_eq!(import_from_cursor(&mut config).unwrap(), 1);
        let server = config
            .mcp
            .servers
            .as_ref()
            .and_then(|servers| servers.get("playwright"))
            .expect("imported server");
        assert!(server.apps.is_empty());
        assert_eq!(server.server["type"], "stdio");
        assert_eq!(server.tags, vec!["cursor"]);
    }
}
