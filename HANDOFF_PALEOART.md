# Handoff: パレオアートモード ストーリー反映改善

> **作成日:** 2026-03-30
> **更新日:** 2026-04-03
> **状態:** Phase 2 codex-review完了（arch ok:true, diff ok:true） → advisory対応済み → コミット＆プッシュ（セッションD）

---

## 概要

パレオアート（oilpainting）モードの画像生成において、ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない問題を修正する。

## 完了済み

- [x] 根本原因分析（`plans/story-driven-paleoart.md`）
- [x] 対象ファイル調査（image-styles.js, character.js, create-diary.js, image-backend.js）
- [x] ExecPlan作成（`plans/story-driven-paleoart-exec.md`）
- [x] 方針C（新スタイル追加）不採用の判断
- [x] テスト計画策定（27件追加予定）
- [x] Codex archレビュー 反復1-5（初回レビュー完了）
- [x] Codex archレビュー 反復6-9（再レビュー1-4）: 各blocking修正済み
- [x] Codex archレビュー 反復10: blocking 1件（非文字列TypeErrorリスク）→ 修正済み
- [x] Codex archレビュー 反復11: blocking 1件（Art style:のDALL-E押出し）→ 修正済み
- [x] Codex archレビュー 反復12: **ok: true** ✅ ExecPlanレビュー完了
- [x] **Phase 1実装完了**（セッションA: 2026-03-31）
  - `lib/image-prompt-requirements.js` 新規作成（共通定数 OILPAINTING_STORY_REQUIREMENTS / GENERIC_IMAGE_PROMPT_REQUIREMENTS）
  - `lib/image-styles.js` oilpainting.claudeInstruction強化（【必須要素】5項目追加）
  - `api/create-diary.js` JSON_OUTPUT_SCHEMA/buildPrompt にstyleId引数追加・export化
  - `tests/image-styles.test.js` claudeInstruction検証テスト1件追加
  - `tests/create-diary-schema.test.js` 新規作成（13件: 定数一貫性1+スキーマ3+buildPrompt統合4+handler統合4+定数内容検証1）
  - 全441テストパス確認
- [x] **Phase 1 codex-review: archレビュー ok: true**（blocking 0件、advisory 2件）
- [x] **Phase 1 codex-review: diff反復1 ok: false** → blocking 2件修正済み
  - blocking 1: `styleId === 'oilpainting'`ハードコードをスタイルメタデータに集約
    - `lib/image-styles.js` に`imagePromptRequirement`プロパティ追加（各スタイル定義に）
    - `lib/image-styles.js` に`getStyleImagePromptRequirement(styleId)`ゲッター追加
    - `api/create-diary.js` から直接import除去、ゲッター使用に変更
  - blocking 2: styleId×modeテストマトリクス完成（3×3: illustration/oilpainting/popillust × normal/dino-story/dino-research）
    - `tests/create-diary-schema.test.js` にbuildPromptテスト5件追加
- [x] **Phase 1 codex-review: diff反復2 ok: false** → blocking 1件修正済み
  - blocking: handlerレベルのstyleIdネガティブテスト不足
    - `tests/create-diary-schema.test.js` にhandlerネガティブテスト3件追加（null/undefined/invalid → 400）
  - 全449テストパス確認
- [x] **Phase 1 codex-review: diff反復3 ok: true** ✅
  - blocking 0件、advisory 1件（getStyleImagePromptRequirementの直接テスト追加推奨）
  - advisory対応: tests/image-styles.test.jsにgetStyleImagePromptRequirementテスト5件追加
  - 全454テストパス確認

## 完了済み（Phase 2）

- [x] **Phase 2 実装完了**（セッションC: 2026-04-03）
  - `lib/character.js` composeImagePrompt冒頭に非文字列正規化 + `IMAGE_PROMPT_HARD_LIMIT=500`クランプ追加
  - `lib/character.js` composed配列を Scene→Art style→basePrompt→eyeDescriptor 順に変更
  - `tests/character.test.js` テスト14件追加（順序3+DALL-E境界6+worst-case1+非文字列正規化4）
  - 全468テストパス確認
- [x] **Phase 2 codex-review完了**（セッションD: 2026-04-03）
  - arch: ok: true（blocking 0, advisory 1）
  - diff: ok: true（blocking 0, advisory 2）
  - advisory対応:
    - `IMAGE_PROMPT_HARD_LIMIT=500` を `lib/prompt-policy.js` に集約（定数分散解消）
    - `tests/character.test.js` に数値入力テスト2件追加（0, 12345）
  - 全470テストパス確認

## 次セッションのアクション

### 1. Phase 3 実装

ExecPlan `plans/story-driven-paleoart-exec.md` のPhase 3を実施する。

## 必読ファイル

| ファイル | 目的 |
|---------|------|
| `plans/story-driven-paleoart-exec.md` | **実装計画（メイン）** — 具体的なコード変更・テスト・リスク |
| `plans/story-driven-paleoart.md` | 根本原因分析・方針立案（参考） |
| `plans/concept-art-prompts.md` | 8シーン参照プロンプト（手動検証用） |

## 変更対象ファイル

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `lib/image-prompt-requirements.js` | 共通定数（oilpainting/汎用） | ✅ Phase 1完了 |
| `lib/image-styles.js` | oilpainting.claudeInstruction強化 | ✅ Phase 1完了 |
| `api/create-diary.js` | JSON_OUTPUT_SCHEMA分岐 + build関数シグネチャ + export化 | ✅ Phase 1完了 |
| `tests/image-styles.test.js` | claudeInstruction検証テスト1件追加 | ✅ Phase 1完了 |
| `tests/create-diary-schema.test.js` | スキーマ・buildPrompt・handler統合テスト13件 | ✅ Phase 1完了 |
| `lib/character.js` | composeImagePrompt冒頭クランプ + 配列順序変更 | ✅ Phase 2 codex-review完了 |
| `lib/prompt-policy.js` | IMAGE_PROMPT_HARD_LIMIT=500 集約 | ✅ Phase 2 advisory対応 |
| `tests/character.test.js` | 順序検証・DALL-E境界・非文字列テスト16件 | ✅ Phase 2 codex-review完了 |

## Codexレビュー修正履歴

### ExecPlanレビュー（反復1-12）

| 反復 | 結果 | blocking | 修正内容 |
|------|------|----------|---------|
| 1 | `ok: false` | styleId伝播テスト不足 | Step 3-2bにbuildPrompt統合テスト追加、buildPrompt export化方針明記 |
| 2 | `ok: false` | dino-research経路未検証 | dino-research+oilpaintingテスト追加、DALL-E境界条件データ、fixture名修正 |
| 3 | `ok: false` | handler経由テスト不足 + DALL-E境界不足 | Step 3-2cにAPIハンドラ統合テスト4件追加、3800文字最悪条件テスト強化 |
| 4 | `ok: false` | CLAUDE_API_KEY漏れ + テスト自己矛盾 | 環境変数追加、テスト目的分離 |
| 5 | `ok: false` | 最悪条件テストのアサート不足 | `not.toContain('Art style:')`追加 |
| 6 | `ok: false` | DALL-Eスタイル欠落リスク | プロンプト長制約表にバリデーション明記 |
| 7 | `ok: false` | generate-image経路での防御不足 | `IMAGE_PROMPT_HARD_LIMIT=500`クランプ追加 |
| 8 | `ok: false` | 共通定数化未計画 | Step 1-0追加: `lib/image-prompt-requirements.js` |
| 9 | `ok: false` | character=null経路のクランプ漏れ | クランプを関数冒頭に移動 |
| 10 | `ok: false` | 非文字列TypeError | クランプ前に文字列正規化追加 |
| 11 | `ok: false` | Art style:のDALL-E押出し | Art style:をcharacter要素の前に移動 |
| 12 | `ok: true` ✅ | — | ExecPlanレビュー完了 |

## 注意事項

- `JSON_OUTPUT_SCHEMA`と`buildPrompt`を`export`にする場合、Vercelのdefault export `handler`には影響しない
- composeImagePromptの順序変更は**全スタイル**に影響する（illustration, popillustも）
- DALL-E 3は1000文字ハード制限あり（`image-backend.js:110-112`）
- テストの`character.imageGeneration.basePrompt`（`imgGen`ではない）に注意

---

*次セッションはPhase 2実装から開始*
