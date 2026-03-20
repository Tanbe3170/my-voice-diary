# JSON パースエラー + Vercel デプロイ失敗 修正計画

## エラー内容

```
Unexpected token 'A', "An error o"... is not valid JSON
```

## 問題の全体像（3つの問題が連鎖）

```
[問題1] api/lib/ に2ファイル追加 → Vercel Hobby 12関数上限超過
    ↓
[問題2] デプロイERROR → 本番にスタイル選択機能が反映されない
    ↓
[問題3] Vercelエラーページ（非JSON）をフロントエンドが .json() でパース → SyntaxError
```

---

## 問題1: Vercel Hobbyプラン 12 Serverless Functions 上限超過（CRITICAL）

### 現状

Vercel Hobbyプランでは `api/` ディレクトリ内の全JSファイル（サブディレクトリ含む）が
Serverless Functionとしてカウントされる。上限は **12個**。

コミット `449750e` で `api/lib/image-styles.js` と `api/lib/image-token.js` を追加した結果、
**13個**となりデプロイが失敗している。

| ディレクトリ | ファイル数 | ファイル |
|-------------|-----------|---------|
| `api/` (トップ) | 7 | create-diary, create-memo, create-research, generate-image, post-instagram, post-bluesky, post-threads |
| `api/lib/` | 6 | cors, jwt, character, image-backend, **image-styles**, **image-token** |
| **合計** | **13** | **上限12を超過** |

### Vercelビルドログ（証拠）

```
Error: No more than 12 Serverless Functions can be added to a Deployment
on the Hobby plan. Create a team (Pro plan) to deploy more.
```

最新3デプロイが全てERROR状態。本番は `50092d4`（docs変更のみ）のデプロイで停止中。

### 修正方針: `api/lib/` → `lib/` に移動

`api/lib/` をプロジェクトルートの `lib/` に移動することで、Vercelの関数カウントから除外する。
`api/` 内のトップレベルファイル（7個）のみがServerless Functionとしてカウントされるようになる。

**移動対象:**
```
api/lib/cors.js         → lib/cors.js
api/lib/jwt.js          → lib/jwt.js
api/lib/character.js    → lib/character.js
api/lib/image-backend.js → lib/image-backend.js
api/lib/image-styles.js → lib/image-styles.js
api/lib/image-token.js  → lib/image-token.js
```

**import パス更新が必要なファイル（リポジトリ全検索で網羅）:**

実装時は `rg "api/lib/|from './lib/" --glob '*.js'` で全参照を検索し、漏れなく更新する。

```
api/create-diary.js     → './lib/...' を '../lib/...' に変更
api/create-memo.js      → 同上
api/create-research.js  → 同上
api/generate-image.js   → 同上
api/post-instagram.js   → 同上
api/post-bluesky.js     → 同上
api/post-threads.js     → 同上
```

**スクリプトのimportパス更新:**
```
scripts/generate-jwt.js → '../api/lib/jwt.js' を '../lib/jwt.js' に変更
```

**テストのimportパス更新:**
```
tests/*.test.js → '../api/lib/...' を '../lib/...' に変更
```

**lib内ファイルのコメント更新:**
```
lib/*.js → 先頭コメント '// api/lib/xxx.js' を '// lib/xxx.js' に変更
```

**注意事項:**
- Vercel Serverless Functionsは `api/` 外のモジュールを `import` で参照可能
  （ビルド時にバンドルされるため）
- `lib/` はルーティング対象外なのでHTTPエンドポイントにならない
- 移動後の関数数: 7個（上限12以内で余裕あり）

---

## 問題2: スタイル選択UIが表示されない

### 原因

問題1のデプロイ失敗により、`449750e` の変更（スタイル選択UI含む）が本番に反映されていない。
**問題1を解消すればデプロイが成功し、自動的に解決する。**

コード自体に問題はない:
- `docs/diary-input.html` L41-53: ラジオボタンUI実装済み
- `docs/diary-input.html` L172-186: 選択時のビジュアルフィードバック実装済み
- `docs/diary-input.html` L266: `styleId` をリクエストに含める処理実装済み
- バックエンド: `styleId` のバリデーション・HMAC署名・プロンプト注入すべて実装済み

---

## 問題3: フロントエンド JSON パースエラー

### 3-1. SNS投稿3箇所: `response.ok` チェック前に `.json()` を呼んでいる（CRITICAL）

| 箇所 | ファイル | 行 |
|------|----------|-----|
| Instagram | `docs/diary-input.html` | L461 |
| Bluesky | `docs/diary-input.html` | L570 |
| Threads | `docs/diary-input.html` | L667 |

**現在のパターン（誤り）:**
```javascript
const igData = await igResponse.json();  // ← エラー時にここで爆発
if (!igResponse.ok) {
  throw new Error(igData.error || 'Instagram投稿に失敗しました。');
}
```

### 3-2. エラー応答の `.json()` もガード不足（HIGH）

| 箇所 | ファイル | 行 |
|------|----------|-----|
| create-diary エラー | `docs/diary-input.html` | L285 |
| generate-image エラー | `docs/diary-input.html` | L364 |

**現在のパターン:**
```javascript
if (!response.ok) {
  const errorData = await response.json();  // ← 非JSONエラー時にここで爆発
  throw new Error(errorData.error || '...');
}
```

### 3-3. バックエンド: `errorBody` 未使用（LOW）

| 箇所 | ファイル | 行 |
|------|----------|-----|
| DALL-E エラー | `api/lib/image-backend.js` | L105-106 |

```javascript
const errorBody = await response.text();  // 取得するが使っていない
throw new Error(`DALL-E 3 API error: ${response.status}`);
```

### 修正方針: 安全なJSONパースヘルパーを導入

```javascript
async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `HTTP ${response.status}` };
  }
}
```

非JSONレスポンスでも `{ error: "An error occurred..." }` として扱え、
既存のエラーハンドリングフローに自然に乗る。

### 修正対象

#### A. `docs/diary-input.html` — フロントエンド（5箇所）

**A-1. safeJsonヘルパー追加**
- `<script>` タグ内の先頭にヘルパー関数を定義

**A-2. SNS投稿3箇所 — okチェック順序修正 + safeJson適用（L461, L570, L667）**

修正後パターン:
```javascript
if (!igResponse.ok) {
  const igError = await safeJson(igResponse);
  throw new Error(igError.error || 'Instagram投稿に失敗しました。');
}
const igData = await igResponse.json();
```

**A-3. create-diary エラーパス — safeJson適用（L285）**

修正後:
```javascript
if (!response.ok) {
  const errorData = await safeJson(response);
  if (response.status === 401) {
    sessionStorage.removeItem('auth_token');
  }
  throw new Error(errorData.error || '日記の作成に失敗しました。');
}
```

**A-4. generate-image エラーパス — safeJson適用（L364）**

修正後:
```javascript
if (!imgResponse.ok) {
  const imgError = await safeJson(imgResponse);
  throw new Error(imgError.error || '画像の生成に失敗しました。');
}
```

#### B. `lib/image-backend.js` — errorBody活用（L105-106）

修正後（sanitizeError でAPIキー等を除去し、ステータスコードのみ確実に含める）:
```javascript
if (!response.ok) {
  const errorBody = await response.text();
  // 構造化JSONならerror.codeを抽出、それ以外はステータスコードのみ
  let detail = '';
  try {
    const parsed = JSON.parse(errorBody);
    detail = parsed?.error?.code || parsed?.error?.message || '';
  } catch {
    // 非JSON（HTMLエラーページ等）の場合は本文を含めない
  }
  throw new Error(`DALL-E 3 API error: ${response.status}${detail ? ` - ${sanitizeError(detail)}` : ''}`);
}
```

---

## 影響範囲

| ファイル | 変更内容 | リスク |
|----------|----------|--------|
| `api/lib/` → `lib/` | ディレクトリ移動 | 中（全importパス変更） |
| `api/*.js` (7ファイル) | importパス更新 | 低（パス文字列のみ） |
| `scripts/generate-jwt.js` | importパス更新 | 低（パス文字列のみ） |
| `tests/*.test.js` | importパス更新 | 低（パス文字列のみ） |
| `lib/*.js` (6ファイル) | 先頭コメント更新 | 低（コメントのみ） |
| `docs/diary-input.html` | safeJson導入 + 5箇所修正 | 低（エラーハンドリングのみ） |
| `lib/image-backend.js` | errorBody安全活用 | 低（エラーメッセージ改善のみ） |

- 正常系のフローは一切変更なし（importパスのみ）
- エラー時の表示がより正確になる

---

## テスト計画

### 自動テスト
1. `npm test` — 全既存テスト通過確認（importパス変更の回帰チェック）
2. `node scripts/generate-jwt.js` — CLIスクリプトがimportパス変更後も動作すること
3. `safeJson` ユニットテスト — `docs/js/safe-json.js` にESモジュールとして切り出し、
   `tests/safe-json.test.js` で以下を自動検証:
   - 正常JSON → パース結果を返す
   - 非JSON（HTMLエラーページ） → `{ error: "..." }` を返す
   - 空レスポンス → `{ error: "HTTP {status}" }` を返す

### デプロイ確認
4. Vercelデプロイ確認 — ERROR → READY に復帰すること

### 手動確認
5. 手動確認項目:
   - スタイル選択UI（イラスト調/油絵調）が本番で表示されること
   - 正常な日記作成フロー（変更なし確認）
   - 意図的に無効なJWTでAPI呼び出し → エラーメッセージが正しく表示されること
   - SNS投稿エラー時にJSON parse errorではなく意味のあるメッセージが出ること

---

## 実装順序

### Phase 1: Vercelデプロイ復旧（最優先）
1. `api/lib/` → `lib/` にディレクトリ移動
2. `rg "api/lib/|from './lib/" --glob '*.js'` で全参照を検索
3. 全 `api/*.js` のimportパスを `'./lib/...'` → `'../lib/...'` に更新
4. `scripts/generate-jwt.js` のimportパスを `'../api/lib/jwt.js'` → `'../lib/jwt.js'` に更新
5. 全 `tests/*.test.js` のimportパスを更新
6. `lib/*.js` の先頭コメント（`// api/lib/xxx.js`）を更新
7. `npm test` 全テスト通過確認
8. `node scripts/generate-jwt.js` 動作確認
9. デプロイ確認

### Phase 2: フロントエンドエラーハンドリング強化
10. `docs/js/safe-json.js` に `safeJson` をESモジュールとして切り出し
11. `tests/safe-json.test.js` でユニットテスト追加
12. `docs/diary-input.html` で `safeJson` をimport + 5箇所修正
13. SNS投稿3箇所の `.ok` チェック順序修正 + `safeJson` 適用
14. create-diary / generate-image エラーパスに `safeJson` 適用
15. `lib/image-backend.js` の `errorBody` 安全活用
16. `npm test` 全テスト通過確認
17. codex-review
