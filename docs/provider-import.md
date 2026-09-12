# 一键导入供应商

中转站或供应商网站打开 `stackferry://` 链接，已安装 StackFerry 的用户会看到确认框。确认后只新增自定义供应商，不会自动启用，也不会覆盖同名条目。未安装应用时系统打不开该链接。

## 链接

完整 payload 用 `data`：

```text
stackferry://import/providers?v=1&data=<base64url(JSON)>
```

NewAPI 聊天设置没有 `{stackferryConfig}`，用查询参数：

```text
stackferry://import/providers?v=1&name=New%20API&baseUrl={address}&apiKey={key}&targets=codex,claude,grok
```

| 参数 | 存在性 | 说明 |
| --- | --- | --- |
| `v` | 可选 | 协议版本。缺省视为 `1`；出现时必须是 `1`，否则拒绝。 |
| `data` | 条件必填 | UTF-8 JSON 的 Base64URL（`-` `_`，无 padding）。解码后 JSON 不得超过 32768 字节。出现时忽略查询参数字段。 |
| `name` | 可选 | 仅无 `data` 时有效。缺省为 `baseUrl` 的 hostname。 |
| `baseUrl` | 条件必填 | 仅无 `data` 时有效。`http` 或 `https`。 |
| `apiKey` | 条件必填 | 仅无 `data` 时有效。去空白后非空。 |
| `targets` | 可选 | 仅无 `data` 时有效。逗号分隔。缺省 `codex,claude,grok`。 |
| `model` | 可选 | 仅无 `data` 时有效。与 JSON `model` 相同。 |
| `models` | 可选 | 仅无 `data` 时有效。逗号分隔的模型 id。 |
| `wireApi` | 可选 | 仅无 `data` 时有效。与 JSON `wireApi` 相同。 |
| `claudeAuthScheme` | 可选 | 仅无 `data` 时有效。与 JSON `claudeAuthScheme` 相同。 |
| `grokApiBackend` | 可选 | 仅无 `data` 时有效。与 JSON `grokApiBackend` 相同。 |

无 `data` 且无 `baseUrl` / `apiKey` 时拒绝。不要使用标准 Base64 的 `+` `/`：它们会被 URL 吃掉。应用也能读带 `+` `/` 的标准 Base64，对接方仍应只发 Base64URL。

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

在控制台「系统设置 → 聊天设置」加入：

```json
{ "StackFerry": "stackferry://import/providers?v=1&name=New%20API&baseUrl={address}&apiKey={key}&targets=codex,claude,grok" }
```

NewAPI 只替换 `{address}`（站点地址，末尾不含 `/` 和 `/v1`，并做 `encodeURIComponent`）和 `{key}`（密钥；不以 `sk-` 开头时 NewAPI 会补上）。令牌页选 StackFerry 后会打开本应用。不要写 `{stackferryConfig}`，NewAPI 不会编码它。

站长自建按钮、需要 `models` / `wireApi` 等字段时，改用上面的 `data` JSON 链接。

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
| 缺少 `data` 且缺少 `baseUrl` / `apiKey`，或 `data` 无法解码 / 超过大小，或 JSON 不是对象 | `import_payload` |
| 缺少 `name` 或 `baseUrl`，或 `baseUrl` 不是合法 URL | `import_invalid` |
| `baseUrl` 不是 `http`/`https` | `models_unsupported_protocol` |
| `apiKey` 为空 | `api_key_required` |
| `targets` 为空或含未知值 | `import_targets` |
| `wireApi` 非法 | `overlay_wire_api` |
| `claudeAuthScheme` 非法 | `claude_auth_scheme` |
| `grokApiBackend` 非法 | `grok_api_backend` |
