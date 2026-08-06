# StackFerry v0.1.8

## 简体中文

### Codex 联网搜索与熔断隔离

- 修复 Codex 独立联网搜索端点 `/v1/alpha/search` 返回 `502/503` 时，错误累计到普通 `/v1/responses` 主通道熔断器的问题。
- 联网搜索继续按照供应商故障转移队列的加入顺序逐个尝试，但不再读取主通道的健康状态，也不会占用主通道的 HalfOpen 探测名额。
- 搜索失败只影响当前搜索请求，不会把仍可正常对话的 Codex 供应商标记为不可用；所有搜索供应商失败后仍保留最具体的上游错误。
- 搜索成功不会清除主通道已有的失败次数或提前关闭主熔断器，保证 `/responses` 的恢复仍由真实主请求决定。

### 兼容性与回归保护

- 保持普通 `/responses` 请求真实 `5xx` 的原有熔断规则不变。
- 保持图片生成和图片编辑的付费请求安全检查、能力缺失处理及禁止不安全重放规则不变。
- 增加端到端回归测试，覆盖连续搜索 `502/503`、主通道已熔断时执行搜索，以及搜索成功不得恢复主通道等场景。

> 上游供应商自身仍可能不支持 `/v1/alpha/search` 或暂时返回 `5xx`。本次修复确保此类搜索端点故障不会扩大为整个 Codex 对话通道不可用。

## English

### Codex Search and Circuit Isolation

- Fixed Codex standalone `/v1/alpha/search` responses with `502/503` being counted against the main `/v1/responses` circuit breaker.
- Search requests still follow configured failover queue order, but no longer read main-channel health or consume its HalfOpen probe permits.
- Search failures now affect only the active search request and cannot mark an otherwise working Codex conversation provider unavailable; the most specific upstream error is retained when all search providers fail.
- Successful searches no longer clear main-channel failure counts or close its circuit early, leaving `/responses` recovery to real main-channel requests.

### Compatibility and Regression Coverage

- Preserved existing circuit-breaker behavior for real `/responses` `5xx` failures.
- Preserved paid image generation and editing safety checks, capability-miss handling, and ambiguous replay protection.
- Added end-to-end regression coverage for repeated search `502/503` responses, searches while the main circuit is open, and successful searches that must not heal main-channel health.

> An upstream provider may still lack `/v1/alpha/search` support or temporarily return `5xx`. This release prevents that search-specific failure from taking down the entire Codex conversation channel.
