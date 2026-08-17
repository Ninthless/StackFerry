use std::fs;

use serde_json::Value;
use stackferry_lib::{
    get_claude_settings_path, read_json_file, AppType, ConfigService, MultiAppConfig, Provider,
};

#[path = "support.rs"]
mod support;
use support::{ensure_test_home, reset_test_fs, test_mutex};

const CLAUDE_PROVIDER_INPUT: &str = include_str!("fixtures/config/claude-provider-input.json");
const CLAUDE_PROVIDER_LIVE: &str = include_str!("fixtures/config/claude-provider-live.json");
const CODEX_MCP_INPUT: &str = include_str!("fixtures/config/codex-mcp-input.toml");
const CODEX_INVALID: &str = include_str!("fixtures/config/codex-invalid.toml");

fn parse_json_fixture(raw: &str) -> Value {
    serde_json::from_str(raw).expect("golden fixture must be valid JSON")
}

#[test]
fn claude_provider_live_write_matches_golden_and_keeps_unknown_fields() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let input = parse_json_fixture(CLAUDE_PROVIDER_INPUT);
    let expected = parse_json_fixture(CLAUDE_PROVIDER_LIVE);

    let mut config = MultiAppConfig::default();
    let provider = Provider::with_id(
        "fixture-claude".to_string(),
        "Fixture Claude".to_string(),
        input.clone(),
        None,
    );
    let manager = config
        .get_manager_mut(&AppType::Claude)
        .expect("claude manager");
    manager
        .providers
        .insert("fixture-claude".to_string(), provider);
    manager.current = "fixture-claude".to_string();

    ConfigService::sync_current_providers_to_live(&mut config).expect("sync claude live");

    let live: Value = read_json_file(&get_claude_settings_path()).expect("read live settings");
    assert_eq!(
        live, expected,
        "Claude live write must strip internal fields and keep unknown user fields"
    );
    assert!(
        live.get("apiFormat").is_none() && live.get("openrouterCompatMode").is_none(),
        "internal Claude fields must never reach live settings.json"
    );
    assert_eq!(
        live.get("futureSetting"),
        expected.get("futureSetting"),
        "unknown top-level fields must round-trip"
    );
}

#[test]
fn codex_mcp_sync_preserves_non_mcp_prefix_from_golden() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let path = stackferry_lib::get_codex_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create codex dir");
    }
    fs::write(&path, CODEX_MCP_INPUT).expect("seed golden codex config");

    let mut config = MultiAppConfig::default();
    config.mcp.codex.servers.insert(
        "echo".into(),
        serde_json::json!({
            "id": "echo",
            "enabled": true,
            "server": { "type": "stdio", "command": "echo" }
        }),
    );

    stackferry_lib::sync_enabled_to_codex(&config).expect("sync codex mcp");

    let text = fs::read_to_string(&path).expect("read config.toml");
    assert!(
        text.starts_with("# fixture-top-comment\n"),
        "top comment from golden input must be preserved byte-for-byte at file start"
    );
    assert!(
        text.contains("custom_future_key = \"preserve-me\""),
        "unknown top-level keys must be preserved"
    );
    assert!(
        text.contains("[profile]") && text.contains("mode = \"fixture\""),
        "non-MCP tables must be preserved"
    );
    assert!(
        text.contains("[custom.future]") && text.contains("enabled = true"),
        "nested unknown tables must be preserved"
    );
    assert!(
        text.contains("mcp_servers")
            && text.contains("echo")
            && text.contains("command = \"echo\""),
        "enabled MCP server must be projected into live config"
    );
}

#[test]
fn codex_invalid_toml_golden_is_left_untouched_on_sync_failure() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let path = stackferry_lib::get_codex_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create codex dir");
    }
    fs::write(&path, CODEX_INVALID).expect("seed invalid golden");

    let err = stackferry_lib::sync_single_server_to_codex(
        &MultiAppConfig::default(),
        "srv",
        &serde_json::json!({ "type": "stdio", "command": "echo" }),
    )
    .expect_err("invalid toml must fail closed");

    let message = err.to_string();
    assert!(
        message.contains("config.toml"),
        "failure should attribute to config.toml, got: {message}"
    );

    let text = fs::read_to_string(&path).expect("read invalid config");
    assert_eq!(
        text, CODEX_INVALID,
        "damaged Codex config must remain byte-identical after failed sync"
    );
}
