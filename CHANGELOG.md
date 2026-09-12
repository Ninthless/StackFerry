# Changelog

用户能感知的变化写在这里。GitHub Release 和应用内更新说明都读当前 `package.json` 版本对应的一节。内部重构、测试和 chore 不必写入。

## 1.0.8 - 2026-09-12

### 修复

- 换 Codex / Grok 供应商后，旧会话不再报 provider not found
- Claude Desktop 换网关时不再覆盖同一份 profile
- Claude Code 不再把压缩窗口自动填成上下文的 90%，避免频繁压缩刷额度

### 升级注意

- 用过 Claude 会话字段的，启用一次当前供应商即可清掉错误的压缩窗口
