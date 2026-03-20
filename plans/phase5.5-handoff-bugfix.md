# 引き継ぎ: 日記作成初回エラー + 画像生成504 バグ修正

## 状況サマリー

2つの本番バグが発生中。修正計画はcodex-reviewを5回反復し`ok: true`で通過済み。
**実装はまだ行っていない。**

### Bug ①: 日記作成 初回500エラー → リトライ成功
- **Vercelログで3回再現確認済み**
- エラー: `LLM出力スキーマ検証エラー: [ 'image_pr...`
- 原因仮説A: Claude APIがimage_promptフィールドを省略するケースがある
- 原因仮説B: `create-diary.js`のmaxDurationが未設定（Hobbyデフォルト10秒）→ Claude API応答が切断

### Bug ②: 画像生成 HTTP 504（100%失敗）
- DALL-E 3のfetchにタイムアウト未設定
- `generate-image.js`にデッドライン管理なし
- maxDuration 30秒ではDALL-E 3に不足

## 修正計画ファイル

**`plans/bugfix-diary-image-errors.md`** — codex-review ok: true 済み

### 変更対象ファイル（5ファイル）

| ファイル | 変更内容 |
|---------|---------|
| `vercel.json` | create-diary maxDuration 30s追加、generate-image 60sに拡大 |
| `api/create-diary.js` | Claude APIにAbortSignal.timeout(25s)、image_promptフォールバック、診断ログ |
| `lib/character.js` | loadCharacterにoptional signal受け渡し |
| `lib/image-backend.js` | deadline伝播、ループ内残時間再計算、lastError保持→タイムアウト再throw、isTimeoutLikeヘルパー |
| `api/generate-image.js` | デッドライン管理(55s)、getRemainingTimeout+null判定→504、isTimeoutError分類 |

### 追加テスト（16項目）

計画書のテスト方針セクション参照。主要テスト:
- image_promptフォールバック動作
- 残時間不足→即504
- DALL-E AbortError→フォールバック→504
- deadline再計算（残時間減衰）
- loadCharacter fail-open
- isTimeoutError 504/500分類

## 実装手順

1. `vercel.json` 更新（即効性あり）
2. `api/create-diary.js` 修正
3. `lib/character.js` 修正
4. `lib/image-backend.js` 修正
5. `api/generate-image.js` 修正
6. テスト追加・全テスト実行
7. codex-review（実装コード）
8. コミット＆プッシュ

## 重要な設計判断

1. **deadline伝播パターン:** `generateImageWithFallback`には絶対時刻deadlineを渡し、ループ内で毎回`remaining = deadline - Date.now() - MARGIN`で再計算
2. **504エラー分類:** `isTimeoutError(err)`でAbortError/TimeoutError/DEADLINE_EXCEEDED/GEMINI_TIMEOUTをcode/nameベースで判定→504、その他→500
3. **loadCharacter fail-open:** タイムアウトしてもcharacter=nullで画像生成続行（504にマップしない）
4. **Gemini Promise.race:** clearTimeout付き、err.code = 'GEMINI_TIMEOUT'で機械判定可能

## Codex-reviewメモ（実装レビュー時の重点確認事項）

> 実装レビュー時は、(1) `generateImageWithFallback`で最後のtimeoutが実際にhandlerまで伝播して504になること、(2) `loadCharacter`失敗時に504へ誤分類されないこと、(3) `isTimeoutError`がcode/nameのみで判定していることをテスト実行結果と合わせて確認してください。
