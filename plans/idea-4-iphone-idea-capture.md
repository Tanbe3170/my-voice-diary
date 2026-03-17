# アイデア4: iPhoneからのアイデア投稿機能 - 実装計画

> **作成日**: 2026-03-17
> **対象**: voice-diary アイデアキャプチャ機能
> **方式**: Vercel Serverless Functions (Node.js ES Modules)
> **ステータス**: 計画段階

---

## 1. 概要・目的

iPhoneの外出先・移動中にアイデアやメモを素早くキャプチャし、GitHub APIを通じて `.company/secretary/inbox/` に保存する機能を実装する。diary-input.htmlにアイデアメモセクションを追加し、既存の日記作成フローと同じ認証基盤を活用する。

**ゴール:**
- iPhoneからワンタップでアイデアをキャプチャできるシンプルUI
- `.company/secretary/inbox/YYYY-MM-DD.md` への追記保存
- 既存の秘書室テンプレート形式（タイムスタンプ付きキャプチャ）に準拠

---

## 2. 方式選定

**選定: 方式B（新規API `api/create-memo.js`）**

| 比較項目 | 方式A: create-diary拡張 | 方式B: 新規API |
|----------|----------------------|----------------|
| 関心の分離 | 低（日記とメモが混在） | 高（単一責務） |
| Claude API呼び出し | 不要なのにスキップロジック必要 | そもそも不要 |
| レート制限 | 日記と共有（30req/日） | 独立設定可能 |
| テスト影響 | 既存168テストへのリグレッションリスク | 新規テストのみ |
| 実装コスト | 条件分岐の複雑化 | 独立ファイルでシンプル |
| 外部API課金 | なし（Claude呼ばない） | なし |

**方式Bを選定する理由:**
1. create-diary.jsはClaude API整形+スキーマ検証+imageToken生成など日記固有のロジックが重い。メモ保存は「テキストをそのままGitHubに保存」するだけで、責務が根本的に異なる
2. 既存168テストへの影響ゼロ
3. 外部API(Claude/DALL-E)を呼ばないので課金発生なし。レート制限も独立管理できる
4. 既存パターン（post-bluesky.js等）と同じ構造で新規APIを追加する実績がある

---

## 3. 技術設計

### 3.1 データフロー

```
[入力] iPhoneブラウザ / diary-input.html
  ↓
[フロントエンド] アイデアメモセクション（テキスト入力 + 送信）
  ↓
[API] POST /api/create-memo
  - CORS検証（api/lib/cors.js）
  - JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
  - Upstash Redisレート制限（50req/日/IP）
  - 入力検証（text: 最大5,000文字）
  - GitHub API: .company/secretary/inbox/YYYY-MM-DD.md に追記
    - ファイル存在確認 → 既存なら追記、なければテンプレから新規作成
  ↓
[レスポンス] { success: true, filePath, timestamp }
```

### 3.2 GitHub保存ロジック

既存ファイルがある場合は「追記」、ない場合は「テンプレートから新規作成」する。

**新規作成時:**
```markdown
---
date: "YYYY-MM-DD"
type: inbox
---

# Inbox - YYYY-MM-DD

## キャプチャ

- **HH:MM** | ユーザー入力テキスト
```

**追記時:**
既存ファイルの末尾に `- **HH:MM** | ユーザー入力テキスト` を追加。

タイムスタンプはJST（Asia/Tokyo）で生成する。

---

## 4. 実装フェーズ

### Phase 1: API実装（api/create-memo.js）
1. api/create-memo.js を作成（post-bluesky.jsパターン準拠）
2. CORS + JWT認証 + レート制限 + 入力検証
3. GitHub API連携（GET既存ファイル → デコード → 追記 → PUT）

### Phase 2: テスト実装（tests/create-memo.test.js）
1. CORS・HTTPメソッド検証テスト
2. JWT認証テスト（JWTのみ）
3. 入力バリデーションテスト
4. 環境変数チェックテスト
5. Upstash Redisレート制限テスト（fail-closed）
6. GitHub API連携テスト（新規作成・追記・上書き）
7. エラーハンドリングテスト

### Phase 3: フロントエンド実装
1. diary-input.htmlにタブUI追加（日記作成 / アイデアメモ）
2. アイデアメモ入力フォーム（テキストエリア + 送信ボタン）
3. style.cssにアイデアメモセクション用スタイル追加
4. JWT認証トークンの共有（既存sessionStorage活用）

### Phase 4: ドキュメント更新
1. CLAUDE.md更新（テスト数、アーキテクチャ図、環境変数テーブル）
2. codex-reviewで最終確認

---

## 5. API仕様

### エンドポイント

```
POST /api/create-memo
```

### リクエストヘッダー

| ヘッダー | 必須 | 説明 |
|----------|------|------|
| Content-Type | Yes | `application/json` |
| X-Auth-Token | Yes | JWT（sub: diary-admin） |
| Origin | Yes | CORS検証用 |

### リクエストボディ

```json
{
  "text": "アイデアのテキスト（必須、最大5,000文字）",
  "tag": "任意のタグ（省略可、最大50文字）"
}
```

### 成功レスポンス（200）

```json
{
  "success": true,
  "filePath": ".company/secretary/inbox/2026-03-17.md",
  "timestamp": "14:32",
  "githubUrl": "https://github.com/OWNER/REPO/blob/main/.company/secretary/inbox/2026-03-17.md"
}
```

### エラーレスポンス

| ステータス | 条件 |
|-----------|------|
| 400 | 不正なリクエスト形式、text未指定、text長超過 |
| 401 | JWT認証失敗 |
| 403 | CORS拒否 |
| 405 | POST以外のメソッド |
| 429 | レート制限超過（50req/日） |
| 500 | サーバーエラー（Upstash障害、GitHub API障害等） |

---

## 6. フロントエンド設計

### 6.1 タブUI

diary-input.htmlの`<main>`直下にタブ切り替えUIを追加する。

```
[日記作成] [アイデアメモ]
```

- デフォルトは「日記作成」タブ（既存動作を維持）
- URLハッシュ `#memo` でアイデアメモタブを直接開ける（ホーム画面ショートカット用）
- タブ切り替えはJavaScriptで表示/非表示を切り替え（ページ遷移なし）

### 6.2 アイデアメモ入力フォーム（クイックキャプチャ最適化）

```html
<div id="memo-tab" style="display:none;">
  <div class="input-area memo-area">
    <label for="memo-text">アイデア・メモ</label>
    <textarea id="memo-text" rows="6"
      placeholder="思いついたことをメモ..."></textarea>
    <span class="memo-char-count">0 / 5000</span>
    <button id="memo-btn" class="memo-submit-btn">
      保存する
    </button>
    <div id="memo-result" style="display:none;"></div>
  </div>
</div>
```

**クイックキャプチャ最適化ポイント:**
- テキストエリアのrows=6（日記の15より小さく、スマホ画面で即入力可能）
- 送信ボタンはシンプル（確認ダイアログなし、素早く保存）
- 保存成功後もテキストエリアをクリアして連続入力可能に
- placeholder短め（モバイル画面最適化）

### 6.3 ホーム画面ショートカット

`diary-input.html#memo` で直接アイデアメモタブが開く設計により、iPhoneのホーム画面にショートカットを追加すれば1タップでメモ入力画面に到達できる。

---

## 7. 保存フォーマット

既存の秘書室テンプレート（`.company/secretary/inbox/_template.md`）に準拠する。

### ファイルパス

```
.company/secretary/inbox/YYYY-MM-DD.md
```

### ファイル形式（新規作成時）

```markdown
---
date: "2026-03-17"
type: inbox
---

# Inbox - 2026-03-17

## キャプチャ

- **14:32** | 思いついたアイデアのテキスト
```

### 追記形式

既存ファイルの末尾に以下を追加:

```markdown
- **15:10** | 次のアイデアテキスト
```

### tagパラメータが指定された場合

```markdown
- **14:32** | [タグ名] 思いついたアイデアのテキスト
```

---

## 8. セキュリティ考慮事項

### 8.1 認証

- JWT認証のみ（AUTH_TOKENフォールバックなし、post-bluesky.jsと同じ方針）
- `sub === 'diary-admin'` で用途拘束

### 8.2 レート制限

| キー | 制限 | TTL |
|------|------|-----|
| `memo_rate:{IP}:{YYYY-MM-DD}` | 50req/日 | 86400秒 |

メモは高頻度投稿が想定されるため、日記(30req)より緩い50req/日とする。Claude API課金が発生しないため、コスト面のリスクも低い。

### 8.3 入力検証

- `text`: 必須、string型、1-5,000文字
- `tag`: 任意、string型、1-50文字（存在時のみ検証）
- Content-Type: `application/json` 必須

### 8.4 CORS

既存 `api/lib/cors.js` をそのまま使用（handleCors関数）。

### 8.5 fail-closed設計

Upstash Redis障害時はGitHub API呼び出しに進まず500を返す（既存パターン踏襲）。

### 8.6 GitHub APIパス検証

`filePath` をハードコードパターン `.company/secretary/inbox/YYYY-MM-DD.md` に限定し、パストラバーサル攻撃を防止する。日付部分は `/^\d{4}-\d{2}-\d{2}$/` で厳密検証する。

---

## 9. テスト計画

### ファイル: `tests/create-memo.test.js`

**テスト構成（推定25-30テスト）:**

1. **CORS・HTTPメソッド（3テスト）**
   - OPTIONSプリフライト処理
   - POST以外は405
   - Origin必須

2. **JWT認証（4テスト）**
   - 有効JWTで認証成功
   - 無効JWTで401
   - sub !== 'diary-admin' で401
   - JWT_SECRET未設定で500

3. **入力バリデーション（5テスト）**
   - text未指定で400
   - text非string型で400
   - text 5,000文字超過で400
   - tag 50文字超過で400
   - Content-Type非JSONで400

4. **環境変数（2テスト）**
   - GITHUB_TOKEN未設定で500
   - UPSTASH環境変数未設定で500

5. **レート制限（4テスト）**
   - 50回以内は通過
   - 51回目で429
   - Redis障害時500（fail-closed）
   - TTL設定失敗時500

6. **GitHub API連携（6テスト）**
   - 新規ファイル作成成功
   - 既存ファイルへの追記成功
   - テンプレート形式の検証（frontmatter、タイムスタンプ）
   - tag付きメモの保存
   - GitHub API障害時500
   - 日付バリデーション（パストラバーサル防止）

7. **成功レスポンス（2テスト）**
   - 正常レスポンスの形式検証
   - filePath・timestamp・githubUrlの値検証

### テストパターン

既存 `tests/post-bluesky.test.js` のモック構造（createMockReq/createMockRes/global.fetch mock）を踏襲する。

---

## 10. リスクと依存関係

### リスク

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| GitHub API同時書き込み競合 | 追記データ消失 | SHA検証で409検出 → リトライ1回 |
| 既存inbox形式との不整合 | 手動作成ファイルと自動保存ファイルの形式差 | テンプレート `_template.md` に厳密準拠 |
| iPhoneでのJWT入力UX | 長いJWTトークンの手入力が困難 | sessionStorageで保持（既存フロー）、コピペ前提 |

### 依存関係

- **外部依存なし**: Claude API / DALL-E 3 / sharp いずれも不要
- **既存共有ライブラリ**: `api/lib/cors.js`, `api/lib/jwt.js`
- **Upstash Redis**: レート制限用（既存環境変数で設定済み）
- **GitHub API**: ファイル保存用（既存環境変数で設定済み）
- **新規環境変数**: なし（既存のGITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, JWT_SECRET, UPSTASH_*を使用）

---

## 見積もり

| フェーズ | 内容 | 規模 |
|---------|------|------|
| Phase 1 | API実装 | 1.5h |
| Phase 2 | テスト実装 | 1.5h |
| Phase 3 | フロントエンド実装 | 1h |
| Phase 4 | ドキュメント・レビュー | 0.5h |
| **合計** | | **約4.5時間** |

---

## 完了基準

- [ ] api/create-memo.js 実装・テスト通過
- [ ] .company/secretary/inbox/ への新規作成・追記動作確認
- [ ] docs/diary-input.html にタブUI追加（日記 / アイデアメモ）
- [ ] URLハッシュ #memo で直接メモタブ表示
- [ ] 全テスト通過（既存168 + 新規約26テスト）
- [ ] JWT認証のみ（フォールバックなし）
- [ ] fail-closed動作確認
- [ ] codex-review ok: true
- [ ] Vercelデプロイ成功
- [ ] iPhoneからの実機動作確認
