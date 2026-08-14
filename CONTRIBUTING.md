# コントリビューションガイド

## 開発フロー

1. Issue を作成し、対応内容を明確にする。
2. `main` から作業ブランチを作成する。ブランチ名は [BRANCHING.md](BRANCHING.md) の命名規則に従う。
3. 変更をコミットする。コミットメッセージは Conventional Commits に従う。
4. リモートへ push し、Pull Request を作成する。
5. レビュー承認と CI のパス後、Squash and merge でマージする。
6. マージ済みの作業ブランチを削除する。

```bash
git switch main
git pull origin main
git switch -c feat/12-add-search-api
# 変更・コミット
git push -u origin feat/12-add-search-api
```

## Pull Request

- 1 PR = 1 目的。レビュー可能な粒度に分割する。
- テンプレート ([.github/pull_request_template.md](.github/pull_request_template.md)) の項目を埋める。
- 作業途中の PR は Draft で作成する。

## レビュー

- レビュー依頼は PR 作成時に行う。
- 指摘は理由を添えて具体的に記載する。
- 必須ではない提案には `nit:` を付ける。
