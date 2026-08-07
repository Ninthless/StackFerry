# StackFerry v0.1.9

## 简体中文

### Responses 容量错误恢复

- Codex 和 Grok Build 的 Responses 请求遇到明确的上游容量不足错误时，会在提交输出前对同一供应商执行两次有限退避重试。
- 重试策略基于 `server_is_overloaded`、`overloaded_error` 等错误语义，与具体模型和供应商无关，因此也适用于后续新增模型。
- 同一供应商重试耗尽后继续使用现有故障转移队列，避免单次上游容量抖动直接中断请求。
- 模型或路由级容量不足不再累计到整个供应商的熔断健康度，防止单个模型过载影响同一供应商下的其他健康模型。

### 兼容性与回归保护

- 普通未知 `502/503` 仍按真实供应商故障处理，不会被误判为容量错误。
- 同时覆盖 HTTP 错误响应和输出开始前的 `response.failed` 流式事件；搜索、图片等辅助端点保持原有重放安全策略。
- 增加协议识别、同供应商恢复、重试耗尽后故障转移和健康状态隔离的回归测试。

> 持续的上游容量不足仍可能导致最终请求失败。本次发布降低短暂容量抖动的影响，并避免模型级故障扩大为整个供应商不可用。

## English

### Responses Capacity Recovery

- Codex and Grok Build Responses requests now retry the same provider twice with bounded backoff when the upstream explicitly reports capacity exhaustion before output is committed.
- Detection uses error semantics such as `server_is_overloaded` and `overloaded_error`, independent of any specific model or provider, so future models receive the same behavior.
- Exhausted same-provider retries continue through the existing failover queue instead of failing immediately on a transient capacity event.
- Model- or route-level capacity exhaustion no longer increments the entire provider's circuit health, preventing one overloaded model from disabling otherwise healthy models on that provider.

### Compatibility and Regression Coverage

- Generic unknown `502/503` responses still follow the existing provider-failure path and are not misclassified as capacity errors.
- Both HTTP error responses and pre-output `response.failed` stream events are covered, while search and image auxiliary endpoints retain their existing replay-safety behavior.
- Added regression coverage for protocol detection, same-provider recovery, failover after retry exhaustion, and provider-health isolation.

> Sustained upstream capacity exhaustion can still produce a final failure. This release reduces the impact of short capacity fluctuations and prevents model-level overload from disabling an entire provider.
