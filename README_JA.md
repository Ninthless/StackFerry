# StackFerry

StackFerry は、AI コーディングツールのプロバイダー、API エンドポイント、認証情報、ローカルルーティングを管理する [CC Switch](https://github.com/farion1231/cc-switch) の独立フォークです。

現在の上流ベースラインは CC Switch `3.19.0` です。StackFerry は独自のパッケージ名とアプリ識別子、`~/.stackferry/stackferry.db`、`stackferry://` Deep Link、同期名前空間、リリース成果物を使用します。`~/.cc-switch` のデータを自動的に読み書きすることはありません。

StackFerry 独自の更新署名鍵を用意するまでは、アプリ内の署名付きインストールを無効にしています。バージョン確認は [StackFerry Releases](https://github.com/Ninthless/StackFerry/releases) を参照します。

## 開発

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm format:check
pnpm test:unit
```

StackFerry は [MIT License](LICENSE) で配布され、CC Switch の元の著作権表示を保持します。
