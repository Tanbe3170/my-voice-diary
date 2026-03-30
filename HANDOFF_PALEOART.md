# Handoff: パレオアートモード ストーリー反映改善

> **作成日:** 2026-03-30
> **更新日:** 2026-03-30 17:30
> **状態:** ExecPlanレビュー完了（codex-review 反復5/5完了） → 実装待ち

---

## 概要

パレオアート（oilpainting）モードの画像生成において、ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない問題を修正する。

## 完了済み

- [x] 根本原因分析（`plans/story-driven-paleoart.md`）
- [x] 対象ファイル調査（image-styles.js, character.js, create-diary.js, image-backend.js）
- [x] ExecPlan作成（`plans/story-driven-paleoart-exec.md`）
- [x] 方針C（新スタイル追加）不採用の判断
- [x] テスト計画策定（18件追加予定）
- [x] Codex archレビュー 反復1: blocking 1件（styleId伝播テスト不足）→ 修正済み
- [x] Codex archレビュー 反復2: blocking 1件（dino-research経路未検証）+ advisory 2件 → 修正済み
- [x] Codex archレビュー 反復3: blocking 2件（handler経由テスト不足、DALL-E境界テスト不足）→ 修正済み
- [x] Codex archレビュー 反復4: blocking 2件（CLAUDE_API_KEY漏れ、テスト自己矛盾）→ 修正済み
- [x] Codex archレビュー 反復5: blocking 1件（最悪条件テストのアサート不足）→ 修正済み

## 次セッションのアクション

### 1. 実装（ExecPlan準拠）— codex-reviewは不要（5反復完了済み）

**Phase 1: Claude指示の強化（リスク: 低）**
1. `lib/image-styles.js:16` — oilpainting.claudeInstructionにストーリー駆動【必須要素】5項目を追加
2. `api/create-diary.js:26-37` — JSON_OUTPUT_SCHEMAにstyleId引数追加 + `export`化、oilpainting時のimage_prompt定義を分岐
3. `api/create-diary.js:127` — `buildPrompt`を`export function`化、styleIdを引数追加・各build関数に伝播
4. `api/create-diary.js:449` — buildPrompt呼び出しにstyleId引数追加
5. `tests/image-styles.test.js` — claudeInstruction検証テスト1件追加
6. `tests/create-diary-schema.test.js`（新規）— スキーマ単体3件 + buildPrompt統合4件 + handler統合4件
7. `npm test` で全テスト通過確認

**Phase 2: プロンプト合成の優先順位変更（リスク: 中）**
8. `lib/character.js:265-276` — composed配列のScene要素を先頭に移動
9. `tests/character.test.js` — 順序検証2件 + DALL-E切り詰め4件追加
10. `npm test` で全テスト通過確認

### 2. 各Phase完了後にcodex-review

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
| 3 | `ok: false` | handler経由テスト不足 + DALL-E境界不足 | Step 3-2cにAPIハンドラ統合テスト4件追加、3800文字最悪条件テスト強化 |
| 4 | `ok: false` | CLAUDE_API_KEY漏れ + テスト自己矛盾 | 環境変数追加、テスト目的分離（実運用500文字境界+3800文字最悪条件） |
| 5 | `ok: false` | 最悪条件テストのアサート不足 | `not.toContain('Art style:')`追加（修正済み、次回レビュー不要） |

## 注意事項

- `JSON_OUTPUT_SCHEMA`と`buildPrompt`を`export`にする場合、Vercelのdefault export `handler`には影響しない
- composeImagePromptの順序変更は**全スタイル**に影響する（illustration, popillustも）
- DALL-E 3は1000文字ハード制限あり（`image-backend.js:110-112`）
- 既存テスト168件が全てパスすることを必ず確認
- テストの`character.imageGeneration.basePrompt`（`imgGen`ではない）に注意
- Codex archレビューは5反復完了済み — ExecPlanへの追加レビューは不要。実装後のcodex-reviewのみ必要

---

*次セッションは `plans/story-driven-paleoart-exec.md` を読んでから作業開始すること*
