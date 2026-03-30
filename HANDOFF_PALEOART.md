# Handoff: パレオアートモード ストーリー反映改善

> **作成日:** 2026-03-30
> **更新日:** 2026-03-30 17:30
> **状態:** ExecPlanレビュー中（codex-review 反復2/5完了） → 実装待ち

---

## 概要

パレオアート（oilpainting）モードの画像生成において、ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない問題を修正する。

## 完了済み

- [x] 根本原因分析（`plans/story-driven-paleoart.md`）
- [x] 対象ファイル調査（image-styles.js, character.js, create-diary.js, image-backend.js）
- [x] ExecPlan作成（`plans/story-driven-paleoart-exec.md`）
- [x] 方針C（新スタイル追加）不採用の判断
- [x] テスト計画策定（12件追加予定）
- [x] Codex archレビュー 反復1: blocking 1件（styleId伝播テスト不足）→ 修正済み
- [x] Codex archレビュー 反復2: blocking 1件（dino-research経路未検証）+ advisory 2件 → 修正済み

## 次セッションのアクション

### 1. Codex archレビュー反復3を実行（5分）

ExecPlanに対するcodex-reviewの続き。反復2までの修正が十分か確認する。
`ok: true`になるまで反復（max_iters残り3回）。

**前回メモ（Codexが残したもの）:**
> 次回は実装後に、(1) 3モード（normal/dino-story/dino-research）でClaude送信プロンプト実測しstyle別schema文言が入ること、(2) compose後3800文字とDALL-E投入1000文字の先頭断面でArt style識別語の残存を確認、(3) 既存create-diary系テスト（ratelimit/timeout/dino）の全通過を再確認する。

### 2. 実装（ExecPlan準拠）

**Phase 1: Claude指示の強化（リスク: 低）**
1. `lib/image-styles.js:16` — oilpainting.claudeInstructionにストーリー駆動【必須要素】5項目を追加
2. `api/create-diary.js:26-37` — JSON_OUTPUT_SCHEMAにstyleId引数追加 + `export`化、oilpainting時のimage_prompt定義を分岐
3. `api/create-diary.js:127` — `buildPrompt`を`export function`化、styleIdを引数追加・各build関数に伝播
4. `tests/image-styles.test.js` — claudeInstruction検証テスト1件追加
5. `tests/create-diary-schema.test.js`（新規）— スキーマ単体テスト3件 + buildPrompt統合テスト4件追加
6. `npm test` で全テスト通過確認

**Phase 2: プロンプト合成の優先順位変更（リスク: 中）**
7. `lib/character.js:265-276` — composed配列のScene要素を先頭に移動
8. `tests/character.test.js` — 順序検証テスト2件 + DALL-E切り詰めスタイル残存テスト2件追加
9. `npm test` で全テスト通過確認

### 3. 各Phase完了後にcodex-review

各Phase完了時に`codex-review`スキルを実行し、ok: trueまで反復。
全Phase完了後、コミット＆プッシュ。

## 必読ファイル

| ファイル | 目的 |
|---------|------|
| `plans/story-driven-paleoart-exec.md` | **実装計画（メイン）** — 具体的なコード変更・テスト・リスク |
| `plans/story-driven-paleoart.md` | 根本原因分析・方針立案（参考） |
| `plans/concept-art-prompts.md` | 8シーン参照プロンプト（手動検証用） |

## 変更対象ファイル

| ファイル | 変更内容 | 既存テスト |
|---------|---------|-----------|
| `lib/image-styles.js` | oilpainting.claudeInstruction書き換え | 32テスト（image-styles.test.js） |
| `api/create-diary.js` | JSON_OUTPUT_SCHEMA分岐 + build関数シグネチャ + export化 | 12テスト（create-diary-ratelimit.test.js） |
| `lib/character.js` | composeImagePrompt配列順序変更 | 44テスト（character.test.js） |

## Codexレビュー修正履歴

| 反復 | 結果 | blocking | 修正内容 |
|------|------|----------|---------|
| 1 | `ok: false` | styleId伝播テスト不足 | Step 3-2bにbuildPrompt統合テスト追加、buildPrompt export化方針明記 |
| 2 | `ok: false` | dino-research経路未検証 | dino-research+oilpaintingテスト追加、DALL-E境界条件データ、fixture名修正 |
| 3 | **未実行** | — | — |

## 注意事項

- `JSON_OUTPUT_SCHEMA`と`buildPrompt`を`export`にする場合、Vercelのdefault export `handler`には影響しない
- composeImagePromptの順序変更は**全スタイル**に影響する（illustration, popillustも）
- DALL-E 3は1000文字ハード制限あり（`image-backend.js:110-112`）
- 既存テスト168件が全てパスすることを必ず確認
- テストの`character.imageGeneration.basePrompt`（`imgGen`ではない）に注意

---

*次セッションは `plans/story-driven-paleoart-exec.md` を読んでから作業開始すること*
