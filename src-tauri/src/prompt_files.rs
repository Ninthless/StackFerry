use std::path::PathBuf;

use crate::app_config::AppType;
use crate::codex_config::get_codex_auth_path;
use crate::config::get_claude_settings_path;
use crate::error::AppError;
use crate::gemini_config::get_gemini_dir;
use crate::openclaw_config::get_openclaw_dir;
use crate::opencode_config::get_opencode_dir;

/// 返回指定应用所使用的提示词文件路径。
pub fn prompt_file_path(app: &AppType) -> Result<PathBuf, AppError> {
    if matches!(app, AppType::ClaudeDesktop) {
        return Err(AppError::localized(
            "app.prompts_unsupported",
            "当前应用暂不支持 Prompts",
            "This app does not support Prompts",
        ));
    }

    let base_dir: PathBuf = match app {
        AppType::Claude => get_base_dir_with_fallback(get_claude_settings_path(), ".claude")?,
        AppType::Codex => get_base_dir_with_fallback(get_codex_auth_path(), ".codex")?,
        AppType::Gemini => get_gemini_dir(),
        AppType::GrokBuild => crate::grok_config::get_grok_config_dir(),
        AppType::OpenCode => get_opencode_dir(),
        AppType::OpenClaw => get_openclaw_dir(),
        AppType::Hermes => crate::hermes_config::get_hermes_dir(),
        AppType::Pi => crate::pi_config::get_pi_dir(),
        AppType::ClaudeDesktop => unreachable!("handled above"),
    };

    let filename = match app {
        AppType::Claude => "CLAUDE.md",
        AppType::Codex => "AGENTS.md",
        AppType::Gemini => "GEMINI.md",
        AppType::Hermes => "SOUL.md",
        AppType::GrokBuild | AppType::OpenCode | AppType::OpenClaw | AppType::Pi => "AGENTS.md",
        AppType::ClaudeDesktop => unreachable!("handled above"),
    };

    Ok(base_dir.join(filename))
}

fn get_base_dir_with_fallback(
    primary_path: PathBuf,
    fallback_dir: &str,
) -> Result<PathBuf, AppError> {
    Ok(primary_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| crate::config::get_home_dir().join(fallback_dir)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use tempfile::TempDir;

    #[test]
    #[serial]
    fn hermes_prompt_file_is_soul_md() {
        let home = TempDir::new().expect("temp home");
        let previous_home = std::env::var_os("STACKFERRY_TEST_HOME");
        std::env::set_var("STACKFERRY_TEST_HOME", home.path());

        let path = prompt_file_path(&AppType::Hermes).expect("Hermes prompt path");

        match previous_home {
            Some(value) => std::env::set_var("STACKFERRY_TEST_HOME", value),
            None => std::env::remove_var("STACKFERRY_TEST_HOME"),
        }
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("SOUL.md")
        );
    }
}
