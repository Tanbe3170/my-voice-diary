# 引き継ぎ: バグ修正実装（2026-03-20 17:50 中断）

## 状況サマリー

Bug ①（create-diary初回500）+ Bug ②（generate-image 504）の**実装とテストは完了**。
**codex-reviewが未実施**。レビュー→修正→コミット＆プッシュが残タスク。

## 完了済み

### 実装（8ファイル、405行変更）
| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `vercel.json` | create-diary maxDuration 30s追加、generate-image 60sに拡大 | ✅ |
| `api/create-diary.js` | Claude APIにAbortSignal.timeout(25s)、image_promptフォールバック、診断ログ | ✅ |
| `lib/character.js` | loadCharacterにoptional signal受け渡し | ✅ |
| `lib/image-backend.js` | deadline伝播（絶対時刻）、ループ内残時間再計算、DALL-E AbortSignal、Gemini Promise.race+clearTimeout、isTimeoutLike判定 | ✅ |
| `api/generate-image.js` | デッドライン管理(55s)、getRemainingTimeout+null判定→504、全fetchタイムアウト、isTimeoutError分類 | ✅ |

### テスト（15件追加、全383件通過）
| ファイル | 追加テスト |
|---------|----------|
| `tests/create-diary-timeout.test.js` | 新規: image_promptフォールバック、Claude APIタイムアウト（2件） |
| `tests/image-backend.test.js` | AbortErrorフォールバック、全バックエンドタイムアウト、deadline超過即エラー、残時間減衰（4件） |
| `tests/character.test.js` | signal付きfetch正常動作、signal未指定時確認（2件） |
| `tests/generate-image.test.js` | AbortError→504、DEADLINE_EXCEEDED→504、GEMINI_TIMEOUT→504、TimeoutError→504、通常エラー→500、loadCharacter fail-open、deadline引数確認（7件） |

### テスト結果
```
Test Files  16 passed (16)
Tests       383 passed (383)
```

## 未完了

1. **codex-review実行**（規模: large — 8ファイル、405行）
   - arch → diff並列 → cross-check の戦略
   - レビュー指摘があれば修正→再レビュー（ok: trueまで）
2. **コミット＆プッシュ**（codex-review通過後）

## 修正計画書

`plans/bugfix-diary-image-errors.md` — codex-review 5回反復でok: true通過済み

## 設計判断（実装済み）

1. **deadline伝播パターン:** `generateImageWithFallback`に絶対時刻deadlineを渡し、ループ内で`remaining = deadline - Date.now() - MARGIN(2000ms)`で再計算
2. **504エラー分類:** `isTimeoutError(err)`でAbortError/TimeoutError/DEADLINE_EXCEEDED/GEMINI_TIMEOUTをcode/nameベースで判定→504
3. **loadCharacter fail-open:** タイムアウトしてもcharacter=nullで画像生成続行（504にマップしない）
4. **image_promptフォールバック:** Claude API応答にimage_prompt欠落時、`A diary illustration about: ${title}`で代替
5. **Gemini Promise.race:** clearTimeout付き、err.code = 'GEMINI_TIMEOUT'

## コミットメッセージ案

```
fix: create-diary初回500エラー + generate-image 504タイムアウト修正

- vercel.json: create-diary maxDuration 30s追加、generate-image 60sに拡大
- create-diary: Claude API AbortSignal.timeout(25s) + image_promptフォールバック
- generate-image: デッドライン管理(55s) + 全fetchタイムアウト + 504分類
- image-backend: deadline伝播 + DALL-E/Geminiタイムアウト
- character: loadCharacter signal受け渡し
- テスト15件追加（全383件通過）
```
