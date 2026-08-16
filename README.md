# タビアミ

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

### 1. 依存関係と環境変数

```bash
npm install
cp .env.example .env.local
```

PowerShellでは次を実行します。

```powershell
Copy-Item .env.example .env.local
```

ルートの`.env.local`へFrontend・OpenAI・Web Pushの値をまとめて記入します。

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_VAPID_PUBLIC_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

Viteがブラウザへ公開するのは`VITE_`で始まる変数だけです。`OPENAI_API_KEY`と`VAPID_PRIVATE_KEY`はFrontend bundleへ含まれず、Edge Functionsだけが`--env-file .env.local`経由で読み取ります。

### 2. ローカル起動

SupabaseとEdge Functionsを起動します。

```bash
npx supabase start
npx supabase functions serve --env-file .env.local
```

別ターミナルでFrontendを起動します。

```bash
npm run dev
```

`OPENAI_API_KEY`が未設定・無効、またはOpenAI APIが失敗した場合、AI処理は付箋・プランを自動生成せず画面へエラーを表示します。

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

Hosted SupabaseではAnonymous Sign-Insを有効化し、`npx supabase secrets set --env-file .env.local --project-ref <project-ref>`でEdge Function Secretsを反映します。Edge Functionsが利用するのは`OPENAI_API_KEY`、`OPENAI_MODEL`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`です。Frontendには`VITE_`で始まる公開値だけを配布します。

バックエンドと Supabase の構成は [docs/backend-supabase-plan.md](docs/backend-supabase-plan.md) を参照。

## 使い方

TBD

## ライセンス

TBD
