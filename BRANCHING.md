# ブランチ戦略 / Branching Strategy

## 基本方針

GitHub Flow をベースとした運用を行う。

- `main` は常にリリース可能な状態を保つ。
- `main` への直接 push は禁止。変更は必ず作業ブランチ + Pull Request 経由で行う。
- PR は最低 1 名のレビュー承認とチェックのパスをもってマージする。
- マージ後の作業ブランチは削除する。

## 恒久ブランチ

| ブランチ | 用途 |
| --- | --- |
| `main` | 本番相当。常にリリース可能な状態 |

## ブランチ命名規則

```
<username>/<type>/<short-description>
<username>/<type>/<issue-number>-<short-description>
```

- `<username>`: 作業者の GitHub ユーザー名（例: `sora-33`）。誰の作業ブランチかを一目で判別するため必須
- `<type>`: 下表のいずれか（小文字）
- `<issue-number>`: 関連する Issue 番号（任意。存在する場合は付与を推奨）
- `<short-description>`: 変更内容を表す英小文字の要約。単語区切りはハイフン (`-`)。3〜5 語程度、50 文字以内

ユーザー名は `git config user.name` ではなく GitHub のアカウント名を使用する。

### type 一覧

| type | 用途 |
| --- | --- |
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | フォーマット等、挙動に影響しない変更 |
| `refactor` | 挙動を変えないリファクタリング |
| `perf` | パフォーマンス改善 |
| `test` | テストの追加・修正 |
| `build` | ビルド・依存関係の変更 |
| `ci` | CI 設定の変更 |
| `chore` | 上記以外の雑務・設定変更 |
| `hotfix` | 本番障害の緊急修正 |
| `release` | リリース準備 |

### 命名の禁止事項

- 大文字・空白・日本語・アンダースコア (`_`) は使用しない（ユーザー名に大文字が含まれる場合は小文字に変換する）
- `<username>` や `<type>` の省略、`/` 以外の区切り文字は使用しない
- 個人名のみ、`test`, `tmp`, `wip` などの意味を持たない名前は使用しない

### 例

```
sora-33/feat/user-login-form
sora-33/feat/12-add-search-api
sora-33/fix/34-null-pointer-on-signup
sora-33/docs/update-readme
sora-33/chore/init-project-scaffold
sora-33/hotfix/45-payment-timeout
sora-33/release/v1.0.0
```

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) に従う。

```
<type>(<scope>): <subject>
```

例: `feat(auth): ログインフォームを追加`

## Pull Request

- タイトルはコミットメッセージと同じ形式 (`<type>: <subject>`) とする。
- 本文は [.github/pull_request_template.md](.github/pull_request_template.md) に従う。
- マージ方式は Squash and merge を基本とする。
