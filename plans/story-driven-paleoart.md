# パレオアートモード ストーリー反映改善計画

## 問題の概要

パレオアート（oilpainting）モードで日記を作成した際、**ストーリーの具体的な場面・感情・キャラクターの行動が画像に反映されない**問題が継続している。

## 根本原因分析

### 原因1: `claudeInstruction` がストーリー要素を十分に指示していない

**現状** (`lib/image-styles.js:15`):
```
画像プロンプトは、パレオアート調（アクリル画風の柔らかい筆跡、金色・琥珀色・
アースカラーの落ち着いた自然色、ゴールデンアワーの劇的な照明、大気遠近法に
よる奥行き）で映える具体的なワンシーンを英語で記述。生物は風景の一部として
自然に統合し、行動的な文脈（捕食、移動、群れの交流）を含めること...
```

**問題点:**
- スタイル（画風）の指示は詳細だが、**ストーリー（何が起きているか）の反映指示がない**
- 「行動的な文脈」は環境描写レベルに留まり、**感情・対立・成長といった物語要素**を含まない
- 結果として、Claudeは「綺麗な風景の中に恐竜がいる」程度のimage_promptしか生成しない

### 原因2: `JSON_OUTPUT_SCHEMA` の image_prompt 定義が汎用的すぎる

**現状** (`api/create-diary.js:35`):
```
"image_prompt": "この日記の中核エピソードを1つの具体的な場面として描写する
英語プロンプト（AI画像生成用）。..."
```

**問題点:**
- 「中核エピソード」が何を指すかが曖昧 → Claudeは無難な風景描写を選びがち
- **ストーリーの転換点・感情のピーク・キャラクターの行動**を明示的に要求していない
- スタイルごとに異なるimage_prompt生成指示がないため、illustrationとoilpaintingで同質のプロンプトが出る

### 原因3: `composeImagePrompt()` でストーリー文脈が希釈される

**現状** (`lib/character.js:261-272`):
```javascript
const composed = [
  resolved.basePrompt,          // キャラクター基本描写
  eyeDescriptor,                // 目の詳細
  `Scene: ${diaryImagePrompt}`, // ← ストーリーはここだけ
  `Art style: ${style.promptPrefix}`, // 長いスタイル記述
  `Style details: ...`,
  `Important details: ...`,
  `Color/Rendering/Atmosphere: ...`,
]
```

**問題点:**
- `Scene:` に入る `diaryImagePrompt` が既に薄い上に、スタイル・キャラクター属性に埋もれる
- 画像生成AIは**プロンプト前半を重視**するため、basePromptやstyle情報が優先される
- ストーリー要素（何が起きているか、なぜ重要か）が後方に押しやられる

## 修正方針

### 方針A: Claude指示の強化（image_prompt生成段階）

ストーリー要素を**生成段階で**richにすることで、後工程での希釈を防ぐ。

#### A-1: `claudeInstruction` にストーリー駆動要素を追加

```javascript
oilpainting: {
  claudeInstruction: '画像プロンプトは、パレオアート調の油絵コンセプトアートとして...' +
    '【必須要素】' +
    '1. 主人公の具体的な行動と感情（何をしている、どう感じている）' +
    '2. シーンの物語的意味（転換点、対立、発見、成長）' +
    '3. 構図とカメラアングル（ローアングル、俯瞰、クローズアップ等）' +
    '4. ライティングと色彩の感情表現（暖色=希望、寒色=危機等）' +
    '5. 環境が物語を語る要素（地質・植生・天候が状況を反映）'
}
```

#### A-2: `JSON_OUTPUT_SCHEMA` のスタイル別 image_prompt 定義

```javascript
// oilpainting用のimage_prompt指示を分岐
const imagePromptInstruction = styleId === 'oilpainting'
  ? 'この日記のストーリーの最も劇的な瞬間を、油絵コンセプトアート風の1シーンとして英語で描写。主人公の行動・感情・構図・ライティング・カラーパレットを具体的に指定すること。'
  : '（既存の汎用定義）';
```

### 方針B: プロンプト合成の優先順位変更（composeImagePrompt段階）

#### B-1: ストーリー要素をプロンプト前方に配置

```javascript
// 変更前: スタイル・キャラクターが先、ストーリーが後
// 変更後: ストーリーが先、スタイル・キャラクターが補助

const composed = [
  `Scene: ${diaryImagePrompt}`,       // ★ ストーリーを最優先
  resolved.basePrompt,                 // キャラクター
  resolved.eyeDescriptor ? `Eye detail: ${resolved.eyeDescriptor}` : null,
  style ? `Art style: ${style.promptPrefix}` : null,
  `Details: ${resolved.consistencyKeywords.join(', ')}`,
  craftAnalysisStr,
].filter(Boolean).join('. ');
```

### 方針C: 新スタイル `oilpainting-story` の追加（オプション）

既存のoilpaintingとの互換性を保ちつつ、ストーリー駆動の強化版を追加:

```javascript
'oilpainting-story': {
  name: 'サバイバルコンセプトアート',
  promptPrefix: 'Oil painting style, survival game concept art with dramatic cinematic composition...',
  claudeInstruction: '（ストーリー駆動の詳細な指示）',
}
```

## 推奨実装順序

| 順序 | 変更 | ファイル | リスク | 影響範囲 |
|------|------|----------|--------|----------|
| 1 | A-1: claudeInstruction強化 | `lib/image-styles.js` | 低 | oilpaintingモードのみ |
| 2 | A-2: image_prompt定義のスタイル別分岐 | `api/create-diary.js` | 低 | create-diary API |
| 3 | B-1: composeImagePromptの優先順位変更 | `lib/character.js` | 中 | 全スタイルの画像生成 |
| 4 | C: 新スタイル追加（任意） | `lib/image-styles.js` | 低 | 新機能追加のみ |

## テスト計画

### 単体テスト追加
- `image-styles.js`: 新しいclaudeInstruction/promptPrefixの検証
- `character.js`: composeImagePromptの優先順位変更後のプロンプト構造検証
- `create-diary.js`: スタイル別image_prompt指示の分岐テスト

### 結合テスト（手動）
- 同じ日記テキストでillustration/oilpaintingを比較し、ストーリー反映の違いを確認
- サバイバルゲームコンセプトの8シーンプロンプトをGemini/DALL-Eで生成し品質確認

## 検証用プロンプト集

別ファイル `plans/concept-art-prompts.md` に8シーンの画像生成プロンプトを用意。
これらを基準として、修正後のシステムが同等品質のプロンプトを自動生成できるか検証する。

## Gemini API統合に関する補足

現状の `lib/image-backend.js` では既に Gemini がフォールバックチェーンに含まれている:
- `gemini-3.1-flash-image-preview` (NB2)
- `gemini-3-pro-image-preview` (NBpro)
- `dall-e-3` (フォールバック)

今回のストーリー反映改善は**プロンプト生成段階**の修正であり、
画像生成バックエンドの変更は不要。Gemini/DALL-E両方で効果が得られる。

---

*作成日: 2026-03-25*
*対象: パレオアートモードのストーリー反映改善*
