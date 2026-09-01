# StackFerry 开发约束

## 项目定位

StackFerry 是基于 Tauri 2、React、TypeScript 和 Rust 的跨平台桌面应用，支持 Windows、macOS 和 Linux。它管理 AI 编程工具的供应商、凭据、模型、路由、会话、Skills、MCP 和用量。

## 开发环境

- 包管理器必须使用 pnpm，版本遵循 `package.json` 的 `packageManager` 字段。
- Node.js 版本必须满足 `package.json` 的 `engines` 字段。
- 完整桌面开发使用 `pnpm dev`；不要只用 `pnpm dev:renderer` 判断 Tauri 功能是否正常。
- `pnpm dev` 使用 `.stackferry-dev/home` 隔离开发数据，不要把真实用户配置写入测试或开发目录。
- Windows 下通过项目脚本启动命令，不能绕过脚本直接假设 Unix shell 行为。

## 架构边界

- 前端按 `src/app`、`src/features`、`src/shared`、`src/platform` 组织。
- `src/features` 之间只能通过对方目录的公开入口 `index.ts` 交互，禁止跨 feature 深层导入。
- `src/shared` 不得依赖 `app` 或具体 feature；共享查询键、契约和 UI 必须保持框架无关或低耦合。
- React Query 的 key、纯查询配置和领域契约不得依赖 React；React hooks 放在对应 feature 的 `model` 模块。
- Tauri `invoke` 只能位于 `src/platform/tauri` 的适配器中，feature 和 app 不得直接调用 IPC。
- Rust 按 capability-first 组织。底层 `core`、`infrastructure`、`database` 不得反向依赖 commands 或具体服务；IPC 注册集中在 `src-tauri/src/ipc/registry.rs`。
- 新增模块前先确认其能力归属、公开 API 和依赖方向，不要恢复根级聚合文件或通用大杂烩模块。
- 手写源文件原则上不超过 800 行；超过时应拆分为有明确职责和测试边界的模块，而不是简单拆文件。

## 数据与安全

- API key、OAuth token 和其他凭据只能通过系统安全存储或受控环境变量传递，禁止写入日志、命令行参数、临时脚本、快照和测试输出。
- 涉及凭据、会话绑定、agent instance、数据库迁移、备份恢复或代理路由的改动，必须检查失败、重试、回滚和跨实例隔离。
- 会话凭据绑定必须明确包含应用类型、运行环境实例和会话标识，不能依赖全局 session ID 猜测。
- 数据库 schema 变更必须增加可重复执行的迁移，并同步更新相关 DAO、备份恢复逻辑、测试和版本契约。
- 外部进程启动必须考虑 Windows、macOS、Linux、WSL、TTY、环境变量继承和退出清理。

## 验证命令

按改动范围选择最小充分验证；提交前至少运行：

```powershell
pnpm verify
```

涉及 Rust、数据库、IPC、启动流程或架构迁移时运行：

```powershell
pnpm verify:full
```

常用专项命令：

```powershell
pnpm typecheck
pnpm format:check
pnpm test:unit
pnpm test:node
pnpm ipc:validate
pnpm architecture:validate
```

- IPC 命令新增、删除或重命名后，先运行 `pnpm ipc:update`，审查 `scripts/ipc-inventory.json` 后再提交。
- 架构例外和超大文件基线只能在有明确理由并经过审查时更新；审查 `scripts/architecture-baseline.json` 和 `scripts/file-size-baseline.json` 的差异。
- 不要为了通过检查而删除测试、放宽校验、扩大 allowlist 或绕过 `-D warnings`。
- 修改前后都检查 `git diff --check`；不要覆盖或回滚用户已有的未提交改动。

## 代码与提交

- 遵循现有 TypeScript、React、Rust 和 Prettier 风格，优先使用已有抽象和公开入口。
- 保持类型、错误处理和异步生命周期完整；不要使用无依据的 `as`、静默忽略错误或全局可变状态。
- 行为变更应补充或更新最接近领域的测试；重构必须证明原有行为保持不变。
- 提交信息使用 Conventional Commits，说明变更目的；不要提交密钥、`.env`、本机路径或生成的运行数据。
- 未经明确要求，不执行 `git push`、发布、创建 PR 或修改远端资源。
