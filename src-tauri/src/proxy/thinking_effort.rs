use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThinkingEffort {
    pub value: String,
    pub source: String,
}

pub fn extract_thinking_effort(body: &Value) -> Option<ThinkingEffort> {
    for (pointer, source) in [
        ("/reasoning/effort", "reasoning.effort"),
        ("/reasoning_effort", "reasoning_effort"),
        ("/reasoningEffort", "reasoningEffort"),
        ("/output_config/effort", "output_config.effort"),
        ("/outputConfig/effort", "outputConfig.effort"),
        (
            "/generationConfig/thinkingConfig/thinkingLevel",
            "generationConfig.thinkingConfig.thinkingLevel",
        ),
        (
            "/generation_config/thinking_config/thinking_level",
            "generation_config.thinking_config.thinking_level",
        ),
        ("/thinking_level", "thinking_level"),
        ("/thinkingLevel", "thinkingLevel"),
    ] {
        if let Some(value) = body.pointer(pointer).and_then(Value::as_str) {
            if let Some(normalized) = normalize_level(value) {
                return Some(ThinkingEffort {
                    value: normalized,
                    source: format!("{source}={value}"),
                });
            }
        }
    }

    if let Some(reasoning) = body.get("reasoning").and_then(Value::as_str) {
        if let Some(normalized) = normalize_level(reasoning) {
            return Some(ThinkingEffort {
                value: normalized,
                source: format!("reasoning={reasoning}"),
            });
        }
    }

    if let Some(thinking_type) = body.pointer("/thinking/type").and_then(Value::as_str) {
        let normalized = match thinking_type.trim().to_ascii_lowercase().as_str() {
            "disabled" | "off" => Some("off"),
            "adaptive" | "auto" => Some("adaptive"),
            _ => None,
        };
        if let Some(value) = normalized {
            return Some(ThinkingEffort {
                value: value.to_string(),
                source: format!("thinking.type={thinking_type}"),
            });
        }
    }

    for (pointer, source) in [
        ("/thinking/budget_tokens", "thinking.budget_tokens"),
        ("/thinking/budgetTokens", "thinking.budgetTokens"),
        (
            "/generationConfig/thinkingConfig/thinkingBudget",
            "generationConfig.thinkingConfig.thinkingBudget",
        ),
        (
            "/generation_config/thinking_config/thinking_budget",
            "generation_config.thinking_config.thinking_budget",
        ),
        ("/thinking_budget", "thinking_budget"),
        ("/thinkingBudget", "thinkingBudget"),
    ] {
        if let Some(budget) = body.pointer(pointer).and_then(Value::as_i64) {
            let value = match budget {
                -1 => "adaptive".to_string(),
                0 => "off".to_string(),
                value if value > 0 => format!("budget:{value}"),
                _ => continue,
            };
            return Some(ThinkingEffort {
                value,
                source: format!("{source}={budget}"),
            });
        }
    }

    None
}

fn normalize_level(value: &str) -> Option<String> {
    let normalized = value
        .trim()
        .to_ascii_lowercase()
        .replace(['-', '_', ' '], "");
    let level = match normalized.as_str() {
        "none" | "off" | "disabled" => "off",
        "minimal" | "min" => "minimal",
        "low" => "low",
        "medium" | "med" => "medium",
        "high" => "high",
        "xhigh" | "extrahigh" => "xhigh",
        "max" | "maximum" | "ultra" | "highest" => "max",
        "adaptive" | "auto" | "dynamic" => "adaptive",
        _ => return None,
    };
    Some(level.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_discrete_levels_across_protocols() {
        for (body, expected, source) in [
            (
                json!({"reasoning": {"effort": "xhigh"}}),
                "xhigh",
                "reasoning.effort=xhigh",
            ),
            (
                json!({"reasoning_effort": "high"}),
                "high",
                "reasoning_effort=high",
            ),
            (
                json!({"output_config": {"effort": "max"}}),
                "max",
                "output_config.effort=max",
            ),
            (
                json!({"generationConfig": {"thinkingConfig": {"thinkingLevel": "minimal"}}}),
                "minimal",
                "generationConfig.thinkingConfig.thinkingLevel=minimal",
            ),
            (json!({"reasoning": "medium"}), "medium", "reasoning=medium"),
        ] {
            assert_eq!(
                extract_thinking_effort(&body),
                Some(ThinkingEffort {
                    value: expected.to_string(),
                    source: source.to_string(),
                })
            );
        }
    }

    #[test]
    fn preserves_adaptive_off_and_budget_semantics() {
        for (body, expected, source) in [
            (
                json!({"thinking": {"type": "adaptive"}}),
                "adaptive",
                "thinking.type=adaptive",
            ),
            (
                json!({"thinking": {"type": "disabled"}}),
                "off",
                "thinking.type=disabled",
            ),
            (
                json!({"thinking": {"budget_tokens": 16000}}),
                "budget:16000",
                "thinking.budget_tokens=16000",
            ),
            (
                json!({"generationConfig": {"thinkingConfig": {"thinkingBudget": -1}}}),
                "adaptive",
                "generationConfig.thinkingConfig.thinkingBudget=-1",
            ),
        ] {
            assert_eq!(
                extract_thinking_effort(&body),
                Some(ThinkingEffort {
                    value: expected.to_string(),
                    source: source.to_string(),
                })
            );
        }
    }

    #[test]
    fn explicit_effort_takes_priority_over_mode_and_budget() {
        let effort = extract_thinking_effort(&json!({
            "output_config": {"effort": "high"},
            "thinking": {"type": "adaptive", "budget_tokens": 32000}
        }));

        assert_eq!(
            effort,
            Some(ThinkingEffort {
                value: "high".to_string(),
                source: "output_config.effort=high".to_string(),
            })
        );
    }
}
