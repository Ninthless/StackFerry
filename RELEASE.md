# StackFerry v0.1.11

## 简体中文

### 故障转移与请求诊断

- Codex 和 Grok Build 遇到上游容量错误时，多供应商路由会立即切换到下一个供应商；仅配置单个供应商时才执行有限的同供应商重试。
- 每个请求会记录供应商尝试顺序、开始时间、耗时、状态码、失败类型与错误信息，便于区分上游故障、客户端或配置问题、StackFerry 处理错误及路由可用性问题。
- 请求详情新增路由诊断时间线、首个有效输出耗时和诊断归属。

### 日志筛选与导出

- 请求日志筛选项现在根据所选时间范围内的真实数据生成，并显示状态码与失败类型数量。
- 失败类型筛选会检查完整路由轨迹，因此故障转移后成功的请求仍可按之前发生的上游错误检索。
- 请求日志可按当前筛选条件导出详细 CSV，包括模型、延迟、Token、成本、诊断归属、错误信息和完整路由轨迹。
- 高级设置中的应用诊断日志新增日志预览、目录快捷入口，以及包含轮转日志、崩溃日志和环境清单的 ZIP 诊断包导出。

> 诊断归属基于结构化错误、状态码和路由轨迹推断。对于缺少结构化证据的旧日志，StackFerry 会保守地标记为暂时无法确定。

## English

### Failover and Request Diagnostics

- Codex and Grok Build requests now fail over immediately to the next provider on upstream capacity errors when multiple providers are available. Limited same-provider retries are retained for single-provider routes.
- Each request records provider attempt order, start time, duration, status, failure classification, and error details to distinguish upstream failures, client or configuration issues, StackFerry processing errors, and routing availability problems.
- Request details now include a route timeline, first meaningful output latency, and diagnostic ownership.

### Log Filtering and Export

- Request log filters are generated from the records in the selected time range and include counts for observed status codes and failure types.
- Failure filtering inspects the complete route trace, so requests recovered by failover remain searchable by earlier upstream failures.
- Filtered request logs can be exported as detailed CSV files with model, latency, token, cost, diagnostic ownership, error, and route-trace fields.
- Application diagnostic logs in Advanced Settings now provide a tail preview, a log-folder shortcut, and ZIP diagnostics containing rotated application logs, crash logs, and an environment manifest.

> Diagnostic ownership is inferred from structured errors, status codes, and route traces. Older records without sufficient evidence are conservatively marked as undetermined.
