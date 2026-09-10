# 一键导入供应商

中转站或供应商网站打开 `stackferry://` 链接，已安装 StackFerry 的用户会看到确认框。确认后只新增自定义供应商，不会自动启用，也不会覆盖同名条目。未安装应用时系统打不开该链接。

## 链接

```text
stackferry://import/providers?v=1&data=<base64url(JSON)>
```

| 参数 | 存在性 | 说明 |
| --- | --- | --- |
| `v` | 可选 | 协议版本。缺省视为 `1`；出现时必须是 `1`，否则拒绝。 |
| `data` | 必填 | UTF-8 JSON 的 Base64URL（`-` `_`，无 padding）。解码后 JSON 不得超过 32768 字节。 |

不要使用标准 Base64 的 `+` `/`：它们会被 URL 吃掉。应用也能读带 `+` `/` 的标准 Base64，对接方仍应只发 Base64URL。

## JSON 字段

| 字段 | 存在性 | 类型 | 约束 |
| --- | --- | --- | --- |
| `name` | 必填 | string | 去空白后非空。 |
| `baseUrl` | 必填 | string | 可被 URL 解析，协议仅 `http` 或 `https`。 |
| `apiKey` | 必填 | string | 去空白后非空。 |
| `targets` | 必填 | string[] | 非空。每项只能是 `codex`、`claude`、`grok`。重复项去重并保留顺序。 |
| `model` | 可选 | string | 三端默认模型。缺省或非字符串视为空。 |
| `models` | 可选 | string[] | 去空白、去重后的模型 id。写入 Codex 与 Claude；Grok 忽略。 |
| `wireApi` | 可选 | string | 仅 Codex。`responses`（默认）或 `chat`。 |
| `claudeAuthScheme` | 可选 | string | 仅 Claude。`bearer`（默认）或 `x-api-key`。 |
| `grokApiBackend` | 可选 | string | 仅 Grok。`responses`（默认）或 `chat_completions`。 |

未列出的字段会被忽略。`null` 不当作缺省，必填字段传 `null` 会失败。

最小示例：

```json
{
  "name": "Acme API",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-example",
  "targets": ["codex", "claude", "grok"]
}
```

完整示例：

```json
{
  "name": "Acme API",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-example",
  "targets": ["codex", "claude", "grok"],
  "model": "gpt-5.4",
  "models": ["gpt-5.4", "claude-sonnet-4"],
  "wireApi": "chat",
  "claudeAuthScheme": "x-api-key",
  "grokApiBackend": "chat_completions"
}
```

## 编码

Node.js：

```js
const payload = {
  name: "Acme API",
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-example",
  targets: ["codex", "claude", "grok"],
}
const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
const url = `stackferry://import/providers?v=1&data=${data}`
```

Python：

```python
import base64, json

payload = {
    "name": "Acme API",
    "baseUrl": "https://api.example.com/v1",
    "apiKey": "sk-example",
    "targets": ["codex", "claude", "grok"],
}
data = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=").decode()
url = f"stackferry://import/providers?v=1&data={data}"
```

## NewAPI

在一键配置里放：

```json
{ "StackFerry": "stackferry://import/providers?v=1&data={stackferryConfig}" }
```

用当前用户的 `name`、`baseUrl`、`apiKey`、`targets` 生成 JSON，再 Base64URL 填进 `{stackferryConfig}`。不要把未编码的 JSON 直接拼进 URL。

## 应用内结果

链接有效时弹出确认框（名称、Base URL、目标 CLI、打码后的密钥）。确认后按 `targets` 顺序调用现有新增接口：

- Codex：自定义 overlay（`wireApi` 写入 toml）
- Claude：自定义供应商（`claudeAuthScheme`）
- Grok：自定义供应商（`grokApiBackend`）

导入不会 Enable，也不会改正在用的 CLI 配置。取消则丢弃，密钥不另存。同一时刻只保留最新一条待确认链接。

## 对接方可预期的失败

| 原因 | 应用错误码 |
| --- | --- |
| 不是 `stackferry://import/providers` | `import_url` |
| `v` 不是 `1` | `import_version` |
| 缺少 / 无法解码 / 超过大小的 `data`，或 JSON 不是对象 | `import_payload` |
| 缺少 `name` 或 `baseUrl`，或 `baseUrl` 不是合法 URL | `import_invalid` |
| `baseUrl` 不是 `http`/`https` | `models_unsupported_protocol` |
| `apiKey` 为空 | `api_key_required` |
| `targets` 为空或含未知值 | `import_targets` |
| `wireApi` 非法 | `overlay_wire_api` |
| `claudeAuthScheme` 非法 | `claude_auth_scheme` |
| `grokApiBackend` 非法 | `grok_api_backend` |
