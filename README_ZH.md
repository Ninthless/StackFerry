<div align="center">

# StackFerry

### 面向 AI 编程工具的供应商配置与本地路由桌面应用

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-CC%20Switch-181717.svg)](https://github.com/farion1231/cc-switch)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#开发)

</div>

StackFerry 是 [CC Switch](https://github.com/farion1231/cc-switch) 的独立分支，用于统一管理 AI 编程工具的供应商、API 端点、凭据与当前路由。StackFerry 与 CC Switch 维护者不存在隶属或官方合作关系。

## 项目状态

当前代码以 CC Switch `3.19.0` 为上游基线。StackFerry 已拥有独立的包名、应用标识、数据目录、数据库、Deep Link 协议、同步命名空间、生成文件名与发布产物名。

默认数据目录为 `~/.stackferry`，数据库为 `stackferry.db`，Deep Link 协议为 `stackferry://`。应用不会自动读取或写入 `~/.cc-switch`；旧数据需要由用户通过导入功能显式迁移。

在 StackFerry 配置独立更新签名密钥之前，应用内签名安装保持关闭。版本检查只读取 StackFerry 的 GitHub Releases，并打开发布页供用户手动下载安装。

## 开发

### 环境要求

- Node.js 18 或更高版本
- pnpm 8 或更高版本
- Rust 1.85 或更高版本
- Tauri CLI 2.8 或更高版本

### 启动

```bash
pnpm install
pnpm dev
```

### 验证

```bash
pnpm typecheck
pnpm format:check
pnpm test:unit
```

### 构建

```bash
pnpm build
```

## 仓库关系

- 上游：[farion1231/cc-switch](https://github.com/farion1231/cc-switch)
- 当前仓库：[Ninthless/StackFerry](https://github.com/Ninthless/StackFerry)

StackFerry 会选择性吸收上游更新，并在本仓库维护独立的产品、界面与发布决策。

## 许可证

StackFerry 使用 [MIT License](LICENSE)。根据 MIT License 要求，项目继续保留原 CC Switch 的版权与许可声明：

```text
Copyright (c) 2025 Jason Young
```
