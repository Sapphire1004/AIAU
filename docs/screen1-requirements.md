# 画面 1 要件定義: アイデアボード + チャット

[docs/requirements.md](requirements.md) の「画面 1」を実装可能な粒度まで具体化した要件定義。

## 1. スコープと前提

- 本書は**画面 1 のみ**を対象とする。上位要件: [requirements.md](requirements.md) の「画面 1: アイデアボード + チャット」
- **技術スタック（確定）**: Vite + React + TypeScript / Supabase（Postgres・Realtime・Auth・Edge Functions）
- ボードはキャンバス系ライブラリを使わず、**絶対配置の div + pointer events** で実装する
- OpenAI 呼び出しは **Edge Function 経由**とし、API キーをクライアントに公開しない
- 画面 2・3 は画面 1 が作る `notes` データを読む → **`notes` のスキーマがチーム間のインターフェース契約**となる
- 認証、旅行作成・招待、RLS、共通テーブルの詳細は [バックエンド・Supabase 実装計画](backend-supabase-plan.md) に従う

## 2. 機能要件

優先度は **L1 → L2 → L3 の順に完成させる**（上位レベルが未完成の場合、次のレベルへ進まない）。Should は L3 完了後、余裕がある場合に実装する。

### L1 — 2 ペイン + 手動操作（AI なしで成立する状態）

| ID | 要件 | 受入条件 |
| --- | --- | --- |
| S1-01 | ユーザー識別 | アプリ接続時に Supabase 匿名 Auth で自動ログインする。ニックネームは**旅行参加時に旅行ごとに**入力し、以後の発言・付箋に作成者として表示される |
| S1-02 | 旅行への参加 | 招待 URL を開くと参加できる。未参加者はニックネーム入力後に `trip_members` へ登録、参加済みユーザーは再入力なしで即入場できる |
| S1-03 | 複数旅行への参加・切替 | 1 ユーザーが複数の旅行に参加できる（グループ A と B で別の旅行など）。自分が参加中の旅行一覧を表示し、切り替えられる |
| S1-04 | 旅行間のデータ分離 | 旅行 A のチャット・付箋が旅行 B の画面に表示されない。Realtime チャネルは `trip:{id}` 単位で分離し、旅行切替時に旧チャネルの購読を解除する |
| S1-05 | 2 ペインレイアウト | 左: 付箋ボード / 右: チャット。デスクトップ基準 |
| S1-06 | チャット送受信 | テキスト発言を送ると、参加者全員の画面にリロードなしで表示される（Realtime） |
| S1-07 | 付箋の手動 CRUD | ユーザーが付箋を直接追加・編集・削除できる。フィールド: タイトル（必須）・補足メモ・属性（住所・所要時間・希望時間帯・費用など、判明分のみ） |
| S1-08 | ドラッグ配置 | 付箋をドラッグで自由に移動できる。移動中の座標は broadcast（50ms スロットル）で他ユーザーへ伝播し、離した瞬間（pointerup）のみ DB に保存する |
| S1-09 | 作成元表示 | 各付箋に AI 抽出か手動作成かを視覚的に区別して表示する |
| S1-10 | 永続化・復元 | リロード後もチャット履歴・付箋（内容・位置・状態）が同一に復元される。画面上の状態はすべて DB に保存されていること |

### L2 — AI 自動反映

| ID | 要件 | 受入条件 |
| --- | --- | --- |
| S1-11 | 抽出トリガー | 最終発言から 2〜3 秒のデバウンスで Edge Function を呼び出す。未処理の発言を一括で渡し、処理中はボードに「AI 整理中」を表示する。発言 1 件ごとの呼び出しは行わない |
| S1-12 | 操作（operation）ベースの反映 | AI の出力は付箋そのものではなく**操作リスト** `add / update / hold` とする。同じ対象の付箋が既にある場合は add ではなく update が返り、既存付箋が更新される |
| S1-13 | 操作の検証 | `update / hold` の対象 ID が実在しない場合、その操作を破棄する。JSON パース失敗時はそのバッチを無視し、次のデバウンスで再試行する |
| S1-14 | ユーザー編集の保護 | ユーザーが編集・移動した付箋は `user_touched=true` となり、以後 AI の update / hold の適用対象から除外される |
| S1-15 | 撤回 = 保留 | チャットで否定・撤回された内容の付箋は**削除せず保留状態**（グレーアウト + 取り消し線）へ遷移する。AI に削除権限は与えない。削除は人間のみが行える |
| S1-16 | 根拠表示 | AI が追加・更新・保留した付箋から根拠となった発言を確認できる（クリックで該当チャットへスクロールジャンプ） |
| S1-17 | AI 変更の取り消し | AI が適用した操作をユーザーが個別に取り消し（undo）できる。取り消すと直前の状態に復元される |
| S1-18 | 失敗時エラー表示 | OpenAI APIが未設定または失敗した場合はAI操作を一切生成せず、チャット・手動付箋・既存データを維持する。原因を画面上に表示し、次の明示的な実行で再試行できる |

### L3 — 品質・仕上げ

| ID | 要件 | 受入条件 |
| --- | --- | --- |
| S1-19 | 保留の解除 | 保留付箋をユーザーが活性状態へ戻せる（戻した付箋は `user_touched=true` となる） |
| S1-20 | グルーピング | 近接配置でグループを表現する（別途のグループオブジェクトは作らず、座標の近さ = 関連とする）。解釈方法は画面 2 チームと合意する |
| S1-21 | 掴み表示 | 他ユーザーがドラッグ中の付箋に表示（枠線など）を付け、同時編集の衝突を減らす。衝突時は last-write-wins とする |

### Should

| ID | 要件 | 受入条件 |
| --- | --- | --- |
| S1-22 | URL 補強 | チャットに URL が含まれる場合、Edge Function が OG タイトルを取得する。Google マップ URL（短縮 URL 含む）はリダイレクト追跡で地名・座標を抽出し、付箋の属性に反映する。3 秒タイムアウト、失敗時はドメイン名のみ表示 |
| S1-23 | 発言削除 | 自分の発言をソフト削除できる（不適切発言への対応）。AI 操作の根拠参照を壊さない |

## 3. データモデル（インターフェース契約）

```sql
trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Asia/Tokyo',
  origin text,
  budget numeric,
  currency text not null default 'JPY',
  created_by uuid not null,         -- auth.uid()
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

trip_members (
  trip_id uuid references trips not null,
  user_id uuid not null,            -- auth.uid()
  nickname text not null,           -- 旅行ごとのニックネーム
  role text not null default 'member', -- 'owner' | 'member'
  joined_at timestamptz default now(),
  primary key (trip_id, user_id)
)

trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips not null,
  token_hash text unique not null,  -- 生の招待トークンは保存しない
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
)

messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips not null,
  author_id uuid not null,
  author_name text not null,
  text text not null,
  processed boolean default false,  -- AI が読んだか
  created_at timestamptz default now(),
  deleted_at timestamptz
)

notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips not null,
  title text not null,
  memo text,
  attrs jsonb default '{}',         -- { address?, lat?, lng?, duration?, time_hint?, cost? }
  origin text not null,             -- 'ai' | 'user'（作成元）
  user_touched boolean default false,
  status text default 'active',     -- 'active' | 'held'（保留）
  hold_reason text,
  source_message_id uuid references messages,
  author_id uuid,
  x float8 default 0, y float8 default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

note_operations (                   -- undo 用ログ（S1-17）
  id uuid primary key default gen_random_uuid(),
  trip_id uuid, note_id uuid,
  op text,                          -- 'add' | 'update' | 'hold'
  before_state jsonb, after_state jsonb,
  source_message_id uuid,
  reverted_at timestamptz,
  reverted_by uuid,
  created_at timestamptz default now()
)
```

画面 2 チームへの契約の要点:

- プランの各予定は `notes.id` を参照すること
- `status='held'`（保留）と `attrs.lat / lng` の有無を考慮して処理すること
- グルーピングは座標の近接として解釈すること（S1-20）

## 4. AI 入出力契約

**入力**（Edge Function → OpenAI、テキストのみ）:

```json
{
  "existing_notes": [
    { "id": "n_03", "title": "○○美術館", "attrs": { "time_hint": "午前" }, "status": "active", "user_touched": false }
  ],
  "new_messages": [
    { "id": "m_15", "author": "yuki", "text": "美術館ちょっと高いらしい、8000円だって" },
    { "id": "m_16", "author": "ken", "text": "駅前のラーメンも行ってみたい" }
  ]
}
```

- `user_touched=true` の付箋も**重複 add 防止のため入力には含める**が、「この付箋は更新禁止」であることを明示する

**出力**:

```json
{ "operations": [
  { "op": "update", "target": "n_03", "attrs": { "cost": "8000円" }, "source": "m_15" },
  { "op": "add", "title": "駅前ラーメン", "memo": "", "attrs": {}, "source": "m_16" }
] }
```

ルール:

- すべての操作に `source`（根拠となる発言 ID）必須
- `hold` には `reason` 必須
- `delete` という op は存在しない（AI に削除権限を与えない）
- 確信が持てない場合は update より add を優先する（重複は人間が統合する方が、誤更新で他人の内容を上書きするより安全）

## 5. 非機能・制約

- OpenAI API キー・Supabase service role key はコミットしない。Edge Function のシークレットで管理し、クライアントには anon key のみを渡す
- RLS: `trip_members` を基準に、旅行の参加者のみが該当旅行のデータを読み書きできる。複数テーブルを変更する操作は RPC に集約する
- 発言の文字数制限（例: 500 文字）、付箋タイトルの制限（例: 60 文字）
- Realtime トラフィック: ドラッグは broadcast のスロットル必須（S1-08）。DB 変更の購読は messages / notes の変更のみとする
- 匿名 Auth の既知の制約: 識別はブラウザ（localStorage）単位。**別端末・別ブラウザでは別ユーザーになる**。正式アカウントへの昇格は将来拡張とする

## 6. 事前検証（実装前・UI 不要）

本画面の唯一の技術的不確実性は S1-12 の「同じ対象の判定」であるため、**OpenAI実APIの契約テストを最優先で実施する**。

- 代表入力: ① 新規の場所の列挙 ② 既存付箋への追加情報（→ update を期待） ③ 撤回発言（→ hold を期待） ④ 雑談のみ（→ 操作 0 件を期待） ⑤ 同じ場所の別表現での再言及（→ add が重複しないか）
- 各 3 回ずつ実行し、判定のブレを確認する
- **スキーマ遵守が不安定な場合は、モデル変更または「add のみ許可 + 手動統合」への設計ダウングレードを判断する**

## 7. 完了判定シナリオ

以下を通しで実演できれば画面 1 は完了とする。

1. 2 つのブラウザ（別ユーザー）で同じ旅行の URL を開く
2. A が「美術館行きたい、午前がいいな」と発言 → 数秒後にボードへ AI 付箋「美術館（午前）」が出現し、両方の画面に表示される
3. B が「美術館 8000 円らしいよ」と発言 → 新しい付箋ではなく**既存の美術館付箋に費用が更新**される
4. A がその付箋のメモを手動編集 → 以後 B が「美術館やっぱり微妙かも」と発言しても**その付箋は変化しない**（保護）
5. B が「ラーメンはなしで」と発言 → ラーメン付箋が保留（取り消し線）へ遷移し、根拠クリックで該当発言へジャンプできる
6. 付箋をドラッグ → 相手の画面で滑らかに追従する
7. ユーザー A が別の旅行に切り替える → この旅行のチャット・付箋が表示されないことを確認し、元の旅行に戻る
8. リロード → チャット・付箋・位置・保留状態がすべて復元される

## 8. 未決事項

- 旅行（trip）作成・招待参加の UI を画面 1 に含めるか、別画面にするか（バックエンドは共通 RPC として実装する）
- グルーピング（S1-20）の画面 2 側での解釈方法
- モバイル対応の範囲（本書はデスクトップ優先）
- `OPENAI_MODEL`を既定値から変更する判断基準（6章の実API契約テストで評価）
- 旅行からの退出・メンバー削除機能の要否（MVP ではなくても成立）
- 招待 URL の既定有効期限（MVP では無期限を候補とし、実装前に確定する）
