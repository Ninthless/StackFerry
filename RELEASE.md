# StackFerry v0.1.14

## 简体中文

### Responses 错误处理

- Responses API 通过成功 HTTP 状态返回失败或取消结果时，StackFerry 现在按上游错误处理，不再错误映射为 422 请求格式错误。
- 上游限流错误返回 429，其他上游生成失败返回 502，并保留原始错误信息，便于容量重试和故障诊断。
- 真正的本地响应转换错误仍返回 422，避免隐藏 StackFerry 自身的格式处理问题。

### 请求日志筛选

- 失败类型筛选现在只匹配请求最终记录的失败类型。
- 最终状态为 200 的故障转移成功请求不会再被计入失败类型筛选结果。
- 路由轨迹仍保留在请求详情和导出日志中，用于查看请求过程中的历史供应商尝试。

## English

### Responses Error Handling

- Responses failures or cancellations returned inside a successful HTTP response are now treated as upstream errors instead of being misreported as 422 request-format errors.
- Upstream rate-limit errors return 429, while other upstream generation failures return 502 with the original error message preserved for retry and diagnosis.
- Genuine local response transformation errors remain 422 so StackFerry processing problems are still distinguishable.

### Request Log Filtering

- Failure-type filters now match only the final failure classification stored for each request.
- Requests that finish with HTTP 200 after failover no longer appear in failure-type results.
- Route traces remain available in request details and exports for inspecting earlier provider attempts.
