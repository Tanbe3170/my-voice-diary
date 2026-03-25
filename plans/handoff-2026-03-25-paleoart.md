# 引き継ぎ: パレオアートモード ストーリー反映改善

**日付:** 2026-03-25
**前セッション:** リサーチ・計画立案・プロンプト設計
**次セッション:** codex-review → 実装

---

## 背景・経緯

パレオアート（oilpainting）モードで日記を生成した際、**ストーリーの具体的な場面が画像に反映されない**問題が継続していた。修正が重なっても改善しないため、今回は「サバイバルゲーム風コンセプトアート」という具体的なストーリーを検証ケースとし、**システムがストーリー駆動の画像プロンプトを自動生成できるよう根本修正**する。

## 作成済みドキュメント

| ファイル | 内容 |
|---------|------|
| `plans/story-driven-paleoart.md` | 根本原因分析 + 修正計画（方針A/B/C） |
| `plans/concept-art-prompts.md` | 検証用8シーンプロンプト集（手作り品質基準） |
| `plans/handoff-2026-03-25-paleoart.md` | 本ドキュメント（引き継ぎ） |

## 次セッションでの作業手順

### Step 1: codex-review（計画レビュー）

```
/codex-review plans/story-driven-paleoart.md
```

レビュー観点:
- 修正方針A/B/Cの妥当性
- 既存テストへの影響
- 段階的実装の順序

### Step 2: 実装（推奨順）

#### 2-1: `lib/image-styles.js` — claudeInstruction強化 (方針A-1)

**変更箇所:** oilpainting.claudeInstruction

**修正内容:** ストーリー駆動要素を追加:
- 主人公の行動と感情
- シーンの物語的意味（転換点、対立、発見）
- 構図とカメラアングル指定
- ライティングの感情表現
- 環境による物語表現

**参考:** `plans/concept-art-prompts.md` の各シーンプロンプトの構造を分析すると、以下のパターンが一貫している:
```
[画風] + [場面設定] + [主人公の行動・感情] + [敵/対立要素] + [構図・カメラ] + [ライティング・カラーパレット] + [物語的意味]
```

#### 2-2: `api/create-diary.js` — image_prompt定義のスタイル別分岐 (方針A-2)

**変更箇所:** `JSON_OUTPUT_SCHEMA` 関数 or `buildNormalPrompt` / `buildDinoStoryPrompt`

**修正内容:** styleIdに応じてimage_promptの生成指示を変える:
- `illustration`: 既存のまま（汎用）
- `oilpainting`: ストーリー駆動の詳細指示

**注意:** JSON_OUTPUT_SCHEMAはstyleIdを引数に取っていないので、引数追加 or styleInstructionに統合

#### 2-3: `lib/character.js` — composeImagePromptの優先順位変更 (方針B-1)

**変更箇所:** `composeImagePrompt()` 関数の composed 配列

**修正内容:** `Scene: ${diaryImagePrompt}` をプロンプト先頭寄りに移動

**リスク:** illustrationモードにも影響するため、テストで両スタイルを検証

#### 2-4: 新スタイル追加（任意、方針C）

`oilpainting-story` をIMAGE_STYLESに追加。既存oilpaintingとの互換性を保つ。

### Step 3: テスト

```bash
# 既存テスト（回帰確認）
npm test

# 新規テスト（追加が必要な場合）
npx vitest run tests/image-styles.test.js  # 要新規作成
```

### Step 4: 手動検証

1. 修正後のシステムでサバイバルゲームストーリーの日記テキストを入力
2. 生成されたimage_promptを `plans/concept-art-prompts.md` の手作りプロンプトと比較
3. 実際に画像生成して品質確認

## 技術的注意事項

- Geminiバックエンドは既に統合済み（`lib/image-backend.js` のフォールバックチェーン）
- 今回の修正は**プロンプト生成段階**のみ。バックエンド変更は不要
- `GOOGLE_API_KEY` は既にVercel環境変数に設定済み
- image_promptの最大長は500文字（`create-diary.js:561`）→ ストーリー駆動で長くなる場合は上限見直し検討

## Gemini画像生成API要約（リサーチ結果）

| モデル | 価格 | 速度 | 用途 |
|--------|------|------|------|
| `gemini-2.5-flash-image` | $0.039 | 0.53秒 | 高速・低コスト |
| `gemini-3.1-flash-image-preview` (NB2) | $0.067 | 中速 | バランス型 |
| `gemini-3-pro-image-preview` (NBpro) | $0.134-$0.24 | 8-12秒 | 高品質 |
| DALL-E 3 | $0.04-$0.08 | 15-25秒 | 既存フォールバック |

**Gemini呼び出し方法:**
```javascript
// REST API（既存のimage-backend.jsと同じパターン）
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
Content-Type: application/json

{
  "contents": [{ "parts": [{ "text": "プロンプト" }] }],
  "generationConfig": { "responseModalities": ["IMAGE"] }
}

// レスポンスから画像抽出
response.candidates[0].content.parts.find(p => p.inlineData?.mimeType?.startsWith('image/'))
```

---

*作成日: 2026-03-25*
*次回アクション: codex-review → 実装 → テスト → 手動検証*
