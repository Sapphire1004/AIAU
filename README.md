# AIAU

チャットの内容を AI が読み取って行きたい場所を付箋として整理し、時間軸のプランに組み立て、カレンダーとして表示するお出かけプランニングアプリ。

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [docs/requirements.md](docs/requirements.md) | 機能要件（3 画面の仕様） |
| [mockups/](mockups/) | 3 画面の静的 UI モックアップ（画面遷移・操作デモ） |
| [docs/screen1-requirements.md](docs/screen1-requirements.md) | 画面 1（アイデアボード + チャット）の詳細要件 |
| [docs/screen3-calendar.md](docs/screen3-calendar.md) | 画面 3（カレンダー）機能要件の決定記録 |
| [docs/backend-supabase-plan.md](docs/backend-supabase-plan.md) | 3 画面共通のバックエンド・Supabase 実装計画 |
| [BRANCHING.md](BRANCHING.md) | ブランチ戦略・命名規則・コミット規約 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 開発の進め方・PR の出し方 |
| [.github/pull_request_template.md](.github/pull_request_template.md) | PR テンプレート |

## セットアップ

```bash
npm install

# 環境変数（Supabase の値はセットアップ担当から共有される）
cp .env.example .env.local
# .env.local に VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を記入

npm run dev
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 型チェック + 本番ビルド |
| `npm run lint` | Lint（oxlint） |
| `npm run test` | テスト実行（Vitest） |
| `npm run verify` | Lint + Test + Build |
| `npm run supabase:start` | ローカル Supabase 起動 |
| `npm run db:reset` | Migration をゼロから再適用 |
| `npm run db:test` | pgTAP DB テスト |
| `npm run types:generate` | ローカル DB から TypeScript 型を生成 |

Hosted Supabase では Anonymous Sign-Ins を有効化する。Web Push を利用する場合は Edge Function Secrets に `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を設定し、公開鍵を `VITE_VAPID_PUBLIC_KEY` に設定する。

バックエンドと Supabase の構成は [docs/backend-supabase-plan.md](docs/backend-supabase-plan.md) を参照。

## 使い方

TBD

## ライセンス

TBD
