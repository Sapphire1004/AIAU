# AIAU

チャットの内容を AI が読み取って行きたい場所を付箋として整理し、時間軸のプランに組み立て、カレンダーとして表示するお出かけプランニングアプリ。

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [docs/requirements.md](docs/requirements.md) | 機能要件（3 画面の仕様） |
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
# .env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を記入

npm run dev
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 型チェック + 本番ビルド |
| `npm run lint` | Lint（oxlint） |
| `npm run test` | テスト実行（Vitest） |

技術選定の詳細と理由は [docs/tech-stack.md](docs/tech-stack.md) を参照。

## 使い方

TBD

## ライセンス

TBD
