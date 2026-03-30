# Handoff: パレオアートモード ストーリー反映改善

> **作成日:** 2026-03-30
> **更新日:** 2026-03-30 18:00
> **状態:** ExecPlan再レビュー中（codex-review 反復9/max5完了、反復10未実施） → レビュー継続 → 実装待ち

---

## 概要

パレオアート（oilpainting）モードの画像生成において、ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない問題を修正する。

## 完了済み

- [x] 根本原因分析（`plans/story-driven-paleoart.md`）
- [x] 対象ファイル調査（image-styles.js, character.js, create-diary.js, image-backend.js）
- [x] ExecPlan作成（`plans/story-driven-paleoart-exec.md`）
- [x] 方針C（新スタイル追加）不採用の判断
- [x] テスト計画策定（21件追加予定）
- [x] Codex archレビュー 反復1-5（初回レビュー完了）
- [x] Codex archレビュー 反復6（再レビュー1）: blocking 1件（DALL-E安全性の明記不足）→ 修正済み
- [x] Codex archレビュー 反復7（再レビュー2）: blocking 2件（経路非依存防御 + テスト設計矛盾）→ 修正済み
- [x] Codex archレビュー 反復8（再レビュー3）: blocking 1件（共通定数化の未計画）→ 修正済み
- [x] Codex archレビュー 反復9（再レビュー4）: blocking 1件（character=null経路のクランプ漏れ）→ 修正済み

## 次セッションのアクション

### 0. ExecPlanレビュー継続（反復10〜）

反復9のblocking修正は完了済みだが、Codex再レビュー（反復10）が未実施。

```
codex-review plans/story-driven-paleoart-exec.md
```

前回メモ:
> 次回は (1) composeImagePromptの500文字クランプがcharacter有無の全経路で適用されること、(2) tests/character.test.jsにcharacter=nullを含む超過入力テストが追加されていること、(3) 共通定数化の実体がphrase-level copyではなく参照ベースになっていること、を確認対象に含める。

→ **3点とも対応済み**のため、ok: trueになる見込み。ならない場合は修正→再レビュー反復。

### 1. 実装（ExecPlan準拠）— レビュー完了後

**Phase 1: Claude指示の強化（リスク: 低）**
0. `lib/image-prompt-requirements.js`（新規）— 共通定数`OILPAINTING_STORY_REQUIREMENTS`/`GENERIC_IMAGE_PROMPT_REQUIREMENTS`
1. `lib/image-styles.js:16` — oilpainting.claudeInstructionに定数参照ベースでストーリー駆動【必須要素】5項目を追加
2. `api/create-diary.js:26-37` — JSON_OUTPUT_SCHEMAに`styleId`引数追加、共通定数から直接参照 + `export`化
3. `api/create-diary.js:127` — `buildPrompt`を`export function`化、styleIdを引数追加・各build関数に伝播
4. `api/create-diary.js:449` — buildPrompt呼び出しにstyleId引数追加
5. `tests/image-styles.test.js` — claudeInstruction検証テスト1件追加
6. `tests/create-diary-schema.test.js`（新規）— 定数一貫性1件 + スキーマ単体3件 + buildPrompt統合4件 + handler統合4件
7. `npm test` で全テスト通過確認

**Phase 2: プロンプト合成の優先順位変更（リスク: 中）**
8. `lib/character.js:244` — composeImagePrompt冒頭に`IMAGE_PROMPT_HARD_LIMIT=500`クランプ追加（character有無に関わらず適用）
9. `lib/character.js:265-276` — composed配列のScene要素を先頭に移動（clampedScene使用）
10. `tests/character.test.js` — 順序検証2件 + DALL-E境界6件（実運用2件+クランプ防御2件+null経路2件）追加
11. `npm test` で全テスト通過確認

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
| 10 | **未実施** | — | 反復9のblocking修正済み、再レビュー待ち |

## 注意事項

- `JSON_OUTPUT_SCHEMA`と`buildPrompt`を`export`にする場合、Vercelのdefault export `handler`には影響しない
- composeImagePromptの順序変更は**全スタイル**に影響する（illustration, popillustも）
- DALL-E 3は1000文字ハード制限あり（`image-backend.js:110-112`）
- 既存テスト168件が全てパスすることを必ず確認
- テストの`character.imageGeneration.basePrompt`（`imgGen`ではない）に注意
- ExecPlanの再レビュー（反復10）を最初に実施し、ok: trueを確認してから実装に着手

---

*次セッションは反復10のcodex-reviewから開始し、その後 `plans/story-driven-paleoart-exec.md` に従って実装*
