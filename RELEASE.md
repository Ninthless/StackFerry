## 简体中文

### 发布工作流

- 发布说明改为直接读取仓库根目录的 `RELEASE.md`，以后发布新版本只需要更新这一个文件。
- 工作流会自动追加从上一稳定版本到当前版本的提交记录，并通过 GitHub API 标注提交者。
- 移除额外的贡献者区块、下载区块、完整历史附件和独立生成脚本，发布正文保持与 MPLR 一致的简洁结构。

### 多平台与自动更新

- 继续发布 Windows、Linux 与 macOS 安装包及更新包。
- 继续生成签名文件和 `latest.json`，保留应用内自动更新能力。

## English

### Release Workflow

- Release notes now read directly from the root-level `RELEASE.md`; future releases only require updating this one file.
- The workflow automatically appends commits from the previous stable version through the current release and resolves GitHub authors through the API.
- Extra contributor, download, full-history attachment, and standalone generator sections have been removed to match MPLR's concise release structure.

### Multi-Platform Updates

- Windows, Linux, and macOS installers and update bundles remain part of every release.
- Signatures and `latest.json` continue to support in-app automatic updates.
