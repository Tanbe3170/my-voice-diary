# 引き継ぎ資料: JSONパースエラー + Vercelデプロイ失敗修正

## ステータス: 計画完了 → 実装待ち

## 修正計画書
`plans/json-parse-error-fix.md` — codex-review ok: true（2反復で収束）

---

## 問題の要約

3つの連鎖問題:
1. **Vercel 12関数上限超過**: `api/lib/` に2ファイル追加（image-styles.js, image-token.js）で13個に → デプロイERROR
2. **スタイル選択UI未反映**: デプロイ失敗により `449750e` の変更が本番に出ていない
3. **JSONパースエラー**: フロントエンドが非JSONエラーレスポンスを `.json()` でパース → SyntaxError

## 修正方針

### Phase 1: Vercelデプロイ復旧（最優先）
- `api/lib/` → `lib/` にディレクトリ移動（関数カウント 13→7 に削減）
- 全ファイルのimportパス更新（`rg` 検索ベースで網羅）
  - `api/*.js`: `'./lib/...'` → `'../lib/...'`
  - `scripts/generate-jwt.js`: `'../api/lib/jwt.js'` → `'../lib/jwt.js'`
  - `tests/*.test.js`: `'../api/lib/...'` → `'../lib/...'`
  - `lib/*.js`: 先頭コメント更新

### Phase 2: フロントエンドエラーハンドリング強化
- `docs/js/safe-json.js` に `safeJson` をESモジュール切り出し
- `tests/safe-json.test.js` でユニットテスト追加
- `docs/diary-input.html` 5箇所修正:
  - SNS投稿3箇所（L461, L570, L667）: `.ok` チェック順序修正 + safeJson適用
  - create-diary エラーパス（L285）: safeJson適用
  - generate-image エラーパス（L364）: safeJson適用
- `lib/image-backend.js` L105-106: errorBody安全活用（構造化JSON抽出）

## Codex Advisory（実装時に考慮）
1. `sanitizeError(detail, apiKey)` のシグネチャ・長さ制限を明確化
2. fetchモックで非JSONエラーの統合テスト追加を検討

## 検証項目
- `npm test` 全テスト通過
- `node scripts/generate-jwt.js` 動作確認
- Vercelデプロイ: ERROR → READY 復帰
- 本番でスタイル選択UIが表示されること

---

## 再開プロンプト

```
前回セッションで「JSONパースエラー + Vercelデプロイ失敗」の修正計画を作成しました。
codex-review ok: true（2反復で収束）済みです。

計画書: plans/json-parse-error-fix.md
引き継ぎ: plans/handoff-json-fix.md

実装をお願いします。Phase 1（api/lib/ → lib/ 移動 + importパス更新）から開始してください。
Phase 1完了後にnpm test + Vercelデプロイ確認、
続いてPhase 2（safeJson導入 + エラーハンドリング修正）を実施してください。
```
