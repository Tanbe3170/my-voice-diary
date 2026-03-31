# Handoff: パレオアートモード ストーリー反映改善

> **作成日:** 2026-03-30
> **更新日:** 2026-03-31
> **状態:** ExecPlanレビュー完了（反復12で ok: true） → Phase 1実装（セッションA） → Phase 2実装（セッションB）

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

## 次セッションのアクション

### 0. ExecPlanレビュー — ✅ 完了

反復12で `ok: true` 達成。ExecPlanレビューは完了済み。実装に着手可能。

### 1. 実装（ExecPlan準拠）

> **⚠️ セッション分割方針（2026-03-31決定）**
> コンテキスト圧迫防止のため、Phase 1 と Phase 2 は**別セッション**で実施する。
> 各Phaseの完了時にコミット＆プッシュし、次セッションへ引き継ぐ。

---

#### セッションA: Phase 1 実装 + codex-review

**Phase 1: Claude指示の強化（リスク: 低）**
0. `lib/image-prompt-requirements.js`（新規）— 共通定数`OILPAINTING_STORY_REQUIREMENTS`/`GENERIC_IMAGE_PROMPT_REQUIREMENTS`
1. `lib/image-styles.js:16` — oilpainting.claudeInstructionに定数参照ベースでストーリー駆動【必須要素】5項目を追加
2. `api/create-diary.js:26-37` — JSON_OUTPUT_SCHEMAに`styleId`引数追加、共通定数から直接参照 + `export`化
3. `api/create-diary.js:127` — `buildPrompt`を`export function`化、styleIdを引数追加・各build関数に伝播
4. `api/create-diary.js:449` — buildPrompt呼び出しにstyleId引数追加
5. `tests/image-styles.test.js` — claudeInstruction検証テスト1件追加
6. `tests/create-diary-schema.test.js`（新規）— 定数一貫性1件 + スキーマ単体3件 + buildPrompt統合4件 + handler統合4件
7. `npm test` で全テスト通過確認
8. `codex-review` で ok: true まで反復
9. コミット＆プッシュ

**セッションA完了後の引き継ぎプロンプト:**
```
cd diary

パレオアートモード ストーリー反映改善 — Phase 2 実装セッション

## 現状
Phase 1（Claude指示の強化）は実装・テスト・codex-review完了済み、コミット済み。
Phase 2（プロンプト合成の優先順位変更）が未実施。

## 作業順序
1. `HANDOFF_PALEOART.md` を読む
2. `plans/story-driven-paleoart-exec.md` の Phase 2 セクション（Step 2-1, Step 3-3）を読む
3. Phase 2 実装 → npm test → codex-review（ok: trueまで）
4. コミット＆プッシュ

## 必読ファイル
1. `HANDOFF_PALEOART.md` — 引き継ぎ概要・セッション分割方針
2. `plans/story-driven-paleoart-exec.md` — ExecPlan（Phase 2: Step 2-1, Step 3-3）
```

---

#### セッションB: Phase 2 実装 + codex-review

**Phase 2: プロンプト合成の優先順位変更（リスク: 中）**
0. `lib/character.js:244` — composeImagePrompt冒頭に非文字列正規化 + `IMAGE_PROMPT_HARD_LIMIT=500`クランプ追加（character有無に関わらず適用）
1. `lib/character.js:265-276` — composed配列を Scene→Art style→basePrompt→eyeDescriptor 順に変更（clampedScene使用）
2. `tests/character.test.js` — 順序検証3件 + DALL-E境界6件 + worst-case1件 + 非文字列正規化4件 追加
3. `npm test` で全テスト通過確認
4. `codex-review` で ok: true まで反復
5. コミット＆プッシュ

### 2. 各Phase完了後にcodex-review

各Phase完了時に`codex-review`スキルを実行し、ok: trueまで反復。
**Phase 1 と Phase 2 は別セッションで実施**（コンテキスト圧迫防止）。

## 必読ファイル

| ファイル | 目的 |
|---------|------|
| `plans/story-driven-paleoart-exec.md` | **実装計画（メイン）** — 具体的なコード変更・テスト・リスク |
| `plans/story-driven-paleoart.md` | 根本原因分析・方針立案（参考） |
| `plans/concept-art-prompts.md` | 8シーン参照プロンプト（手動検証用） |

## 変更対象ファイル

| ファイル | 変更内容 | 既存テスト |
|---------|---------|-----------|
| `lib/image-prompt-requirements.js` | **新規** 共通定数（oilpainting/汎用） | — |
| `lib/image-styles.js` | oilpainting.claudeInstruction書き換え（定数参照） | 32テスト（image-styles.test.js） |
| `api/create-diary.js` | JSON_OUTPUT_SCHEMA分岐（定数参照） + build関数シグネチャ + export化 | 12テスト（create-diary-ratelimit.test.js） |
| `lib/character.js` | composeImagePrompt冒頭クランプ + 配列順序変更 | 44テスト（character.test.js） |

## Codexレビュー修正履歴

### 初回レビュー（反復1-5）

| 反復 | 結果 | blocking | 修正内容 |
|------|------|----------|---------|
| 1 | `ok: false` | styleId伝播テスト不足 | Step 3-2bにbuildPrompt統合テスト追加、buildPrompt export化方針明記 |
| 2 | `ok: false` | dino-research経路未検証 | dino-research+oilpaintingテスト追加、DALL-E境界条件データ、fixture名修正 |
| 3 | `ok: false` | handler経由テスト不足 + DALL-E境界不足 | Step 3-2cにAPIハンドラ統合テスト4件追加、3800文字最悪条件テスト強化 |
| 4 | `ok: false` | CLAUDE_API_KEY漏れ + テスト自己矛盾 | 環境変数追加、テスト目的分離（実運用500文字境界+3800文字最悪条件） |
| 5 | `ok: false` | 最悪条件テストのアサート不足 | `not.toContain('Art style:')`追加 |

### 再レビュー（反復6-9）

| 反復 | 結果 | blocking | 修正内容 |
|------|------|----------|---------|
| 6 | `ok: false` | DALL-Eスタイル欠落リスク（ハード制御の明記不足） | プロンプト長制約表・リスク評価に`create-diary.js:557-562`のバリデーション明記 |
| 7 | `ok: false` | generate-image経路での防御不足 + テスト設計矛盾 | Step 2-1に`IMAGE_PROMPT_HARD_LIMIT=500`クランプ追加、テストをクランプ防御検証に変更 |
| 8 | `ok: false` | claudeInstruction/JSON_OUTPUT_SCHEMAの共通定数化未計画 | Step 1-0追加: `lib/image-prompt-requirements.js`に共通定数、テスト1件追加（計19→21件） |
| 9 | `ok: false` | character=null経路のクランプ漏れ | クランプを関数冒頭に移動、character=null防御テスト2件追加（計21件） |
| 10 | `ok: false` | diaryImagePrompt非文字列時のTypeError | クランプ前に文字列正規化追加、非文字列テスト4件追加（計25件） |
| 11 | `ok: false` | Art style:がbasePrompt後段でDALL-E先頭1000文字外に押し出される | Art style:をcharacter要素の前に移動、worst-caseテスト追加（計27件） |
| 12 | `ok: true` ✅ | — | blocking 0件。ExecPlanレビュー完了 |

## 注意事項

- `JSON_OUTPUT_SCHEMA`と`buildPrompt`を`export`にする場合、Vercelのdefault export `handler`には影響しない
- composeImagePromptの順序変更は**全スタイル**に影響する（illustration, popillustも）
- DALL-E 3は1000文字ハード制限あり（`image-backend.js:110-112`）
- 既存テスト168件が全てパスすることを必ず確認
- テストの`character.imageGeneration.basePrompt`（`imgGen`ではない）に注意
- ExecPlanレビューは反復12で完了済み（ok: true）。実装に直接着手可能

---

*次セッションはセッションA（Phase 1実装）から開始*
