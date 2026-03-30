# Handoff: パレオアートモード ストーリー反映改善

> **作成日:** 2026-03-30
> **状態:** 計画完了 → 実装待ち

---

## 概要

パレオアート（oilpainting）モードの画像生成において、ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない問題を修正する。

## 完了済み

- [x] 根本原因分析（`plans/story-driven-paleoart.md`）
- [x] 対象ファイル調査（image-styles.js, character.js, create-diary.js, image-backend.js）
- [x] ExecPlan作成（`plans/story-driven-paleoart-exec.md`）
- [x] 方針C（新スタイル追加）不採用の判断
- [x] テスト計画策定（6件追加予定）

## 次セッションのアクション

### 実装（ExecPlan準拠）

**Phase 1: Claude指示の強化（リスク: 低）**
1. `lib/image-styles.js:16` — oilpainting.claudeInstructionにストーリー駆動【必須要素】5項目を追加
2. `api/create-diary.js:26-37` — JSON_OUTPUT_SCHEMAにstyleId引数追加、oilpainting時のimage_prompt定義を分岐
3. `tests/image-styles.test.js` — claudeInstruction検証テスト1件追加
4. `tests/create-diary-schema.test.js`（新規）— スタイル別分岐テスト3件追加
5. `npm test` で全テスト通過確認

**Phase 2: プロンプト合成の優先順位変更（リスク: 中）**
6. `lib/character.js:265-276` — composed配列のScene要素を先頭に移動
7. `tests/character.test.js` — 順序検証テスト2件追加
8. `npm test` で全テスト通過確認

### レビュー

各Phase完了時に`codex-review`スキルを実行し、ok: trueまで反復。

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
| `api/create-diary.js` | JSON_OUTPUT_SCHEMA分岐 + build関数シグネチャ | 12テスト（create-diary-ratelimit.test.js） |
| `lib/character.js` | composeImagePrompt配列順序変更 | 44テスト（character.test.js） |

## 注意事項

- `JSON_OUTPUT_SCHEMA`を`export const`にする場合、Vercelのdefault export `handler`には影響しない
- composeImagePromptの順序変更は**全スタイル**に影響する（illustration, popillustも）
- DALL-E 3は1000文字ハード制限あり（`image-backend.js:110-112`）
- 既存テスト168件が全てパスすることを必ず確認

---

*次セッションは `plans/story-driven-paleoart-exec.md` を読んでから実装開始すること*
