# Import a provider

<p align="center">
  <b>English</b> · <a href="./provider-import.zh-CN.md">简体中文</a>
</p>

A gateway or provider site opens a `stackferry://` link. A user who already has StackFerry installed sees a confirmation dialog. Confirming only adds custom providers. It does not enable them, and it does not overwrite an entry with the same name. If the app is not installed, the operating system cannot open the link.

## Link

A full payload uses `data`:

```text
stackferry://import/providers?v=1&data=<base64url(JSON)>
```

NewAPI chat settings have no `{stackferryConfig}`, so use query parameters:

```text
stackferry://import/providers?v=1&name=New%20API&baseUrl={address}&apiKey={key}&targets=codex,claude,grok
```

| Parameter | Presence | Description |
| --- | --- | --- |
| `v` | optional | Protocol version. Missing means `1`. When present it must be `1`, otherwise the link is rejected. |
| `data` | conditionally required | Base64URL of UTF-8 JSON (`-` and `_`, no padding). The decoded JSON must be at most 32768 bytes. When present, query-parameter fields are ignored. |
| `name` | optional | Used only when `data` is absent. Defaults to the hostname of `baseUrl`. |
| `baseUrl` | conditionally required | Used only when `data` is absent. `http` or `https`. |
| `apiKey` | conditionally required | Used only when `data` is absent. Must be non-empty after trimming whitespace. |
| `targets` | optional | Used only when `data` is absent. Comma-separated. Defaults to `codex,claude,grok`. |
| `model` | optional | Used only when `data` is absent. Same as JSON `model`. |
| `models` | optional | Used only when `data` is absent. Comma-separated model ids. |
| `wireApi` | optional | Used only when `data` is absent. Same as JSON `wireApi`. |
| `claudeAuthScheme` | optional | Used only when `data` is absent. Same as JSON `claudeAuthScheme`. |
| `grokApiBackend` | optional | Used only when `data` is absent. Same as JSON `grokApiBackend`. |

The link is rejected when both `data` and `baseUrl` / `apiKey` are missing. Do not use standard Base64 `+` and `/`: a URL consumes them. The app can still read standard Base64 that contains `+` and `/`, but integrators should send Base64URL only.

## JSON fields

| Field | Presence | Type | Constraint |
| --- | --- | --- | --- |
| `name` | required | string | Non-empty after trimming whitespace. |
| `baseUrl` | required | string | Must parse as a URL. Scheme is only `http` or `https`. |
| `apiKey` | required | string | Non-empty after trimming whitespace. |
| `targets` | required | string[] | Non-empty. Each item is only `codex`, `claude`, or `grok`. Duplicates are removed and order is kept. |
| `model` | optional | string | Default model for all three CLIs. Missing, or a non-string, is treated as empty. |
| `models` | optional | string[] | Model ids, trimmed and de-duplicated. Written for Codex and Claude. Grok ignores this field. |
| `wireApi` | optional | string | Codex only. `responses` (default) or `chat`. |
| `claudeAuthScheme` | optional | string | Claude only. `bearer` (default) or `x-api-key`. |
| `grokApiBackend` | optional | string | Grok only. `responses` (default) or `chat_completions`. |

Fields that are not listed are ignored. `null` is not treated as missing. A required field set to `null` fails.

Minimal example:

```json
{
  "name": "Acme API",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-example",
  "targets": ["codex", "claude", "grok"]
}
```

Full example:

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

## Encoding

Node.js:

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

Python:

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

Add this under console **System settings → Chat settings**:

```json
{ "StackFerry": "stackferry://import/providers?v=1&name=New%20API&baseUrl={address}&apiKey={key}&targets=codex,claude,grok" }
```

NewAPI replaces only `{address}` (site address, with no trailing `/` or `/v1`, passed through `encodeURIComponent`) and `{key}` (the key; NewAPI prefixes `sk-` when the key does not already start with it). Choosing StackFerry on the token page opens this app. Do not write `{stackferryConfig}`: NewAPI does not encode it.

A site-owned button that needs `models`, `wireApi`, or the other JSON fields should use the `data` JSON link above.

## Result in the app

A valid link opens a confirmation dialog showing the name, Base URL, target CLIs, and a masked key. Confirming calls the existing add APIs in `targets` order:

- Codex: a custom overlay (`wireApi` is written into the toml)
- Claude: a custom provider (`claudeAuthScheme`)
- Grok: a custom provider (`grokApiBackend`)

Import does not enable the provider and does not change the CLI config that is currently in use. Cancelling discards the offer. The key is not stored separately. Only the latest pending link is kept.

## Failures an integrator should expect

| Cause | App error code |
| --- | --- |
| Not `stackferry://import/providers` | `import_url` |
| `v` is not `1` | `import_version` |
| `data` is missing and `baseUrl` / `apiKey` are missing, or `data` cannot be decoded or exceeds the size limit, or the JSON is not an object | `import_payload` |
| `name` or `baseUrl` is missing, or `baseUrl` is not a valid URL | `import_invalid` |
| `baseUrl` is not `http` or `https` | `models_unsupported_protocol` |
| `apiKey` is empty | `api_key_required` |
| `targets` is empty or contains an unknown value | `import_targets` |
| `wireApi` is invalid | `overlay_wire_api` |
| `claudeAuthScheme` is invalid | `claude_auth_scheme` |
| `grokApiBackend` is invalid | `grok_api_backend` |
