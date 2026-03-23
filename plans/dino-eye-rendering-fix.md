# 恐竜キャラクター目レンダリング改善計画

## ステータス: リサーチ・計画策定完了 → 実装待ち

---

## 1. 問題の特定

### 症状
恐竜ストーリーモードで日記作成→画像生成時、キャラクター（ケッツ）の**目が不自然**に生成される。

### 根本原因（3点）

#### 原因1: スタイル非依存のbasePrompt
`characters/quetz-default.json`の`basePrompt`が**常に同一**で、パレオアートモードでも「kawaii cartoon style」「large expressive friendly eyes」が適用される。

```
現在のbasePrompt:
"A cute chibi Quetzalcoatlus pterosaur character, 2-3 head proportion, oversized head with long pointed toothless beak, small sagittal crest on top, body covered in soft pycnofibers giving fluffy appearance, stubby folded wings, warm brown and cream countershading coloring, large expressive friendly eyes, kawaii cartoon style with scientifically accurate silhouette"
```

**問題**: パレオアートモードでは「kawaii」「chibi」「large expressive friendly eyes」が矛盾し、AIが中途半端なレンダリングを出力する。

#### 原因2: 目の描写が曖昧
「large expressive eyes」は具体性が不足。AIは以下を生成しがち：
- アニメ風の巨大な目（パレオアートに不適切）
- 爬虫類的なスリット瞳孔（鳥類系統の翼竜には不正確）
- キャッチライトや虹彩の色指定がなく、生気のない目

#### 原因3: composeImagePrompt()にスタイル分岐なし
`lib/character.js`の`composeImagePrompt()`が`styleId`に応じてキャラクター属性を切り替える仕組みがない。常に同じ`basePrompt`と`consistencyKeywords`を使用。

### エラー防止の観点
- **スタイル不整合検出**: 現在、kawaii属性がpainting系スタイルに混入しても警告なし
- **プロンプト長**: 複数のスタイル指示が合成されると冗長になり、DALL-E 1000文字制限に収まらず切り捨てられるリスク
- **フォールバック安全性**: Gemini→DALL-Eフォールバック時にプロンプト解釈差異が増幅

---

## 2. 参考画像分析

### イラストモード目標 — PteroSample.jpeg
- **目のスタイル**: 小さく丸い、琥珀色/オレンジ色の虹彩
- **瞳孔**: 丸型（鳥類型）、黒色
- **ハイライト**: 小さなキャッチライト1点
- **全体**: シンプルだが生き生きしている。アニメ的巨大目ではなく、サイズは控えめ
- **線画**: 太い輪郭線、幾何学的形状、フラットな着色

### パレオアートモード目標 — Pablo Rivera氏スタイル（Diarysample01-05.png）
- **目のスタイル**: 写実的、鳥類の解剖学に基づく
- **瞳孔**: 丸型（現生鳥類＝恐竜の直系子孫に準拠）
- **虹彩**: 暗い琥珀色〜濃い茶色、環境光を反映
- **キャッチライト**: 環境光の反射が生命感を表現
- **表現**: 知性的・意識的な眼差し。「怪獣」ではなく「野生動物」
- **可愛さ**: 不要。リアリティと科学的正確性が最優先

### Pablo Rivera氏スタイル特徴まとめ
| 要素 | 特徴 |
|------|------|
| 照明 | 自然光ベース、ゴールデンアワー、木漏れ日、体積光 |
| 構図 | 環境主導型、動物は風景の一部 |
| 色彩 | アースカラー中心、金色のハイライト、青みの影 |
| 雰囲気 | 静謐・観察的、野生動物ドキュメンタリー的 |
| 目 | 鳥類型丸瞳孔、環境光反射、知性的眼差し |
| 影響 | Douglas Henderson、BBCドキュメンタリー |

---

## 3. 実装計画

### Phase A: キャラクター定義のスタイル別分岐（characters/quetz-default.json）

#### A-1: `imageGeneration`にスタイル別オーバーライドを追加

```json
{
  "imageGeneration": {
    "basePrompt": "(現状維持 - illustrationのデフォルト)",
    "styleOverrides": {
      "illustration": {
        "basePrompt": "A cute chibi Quetzalcoatlus pterosaur character, 2-3 head proportion, oversized head with long pointed toothless beak, small sagittal crest on top, body covered in soft pycnofibers giving fluffy appearance, stubby folded wings, warm brown and cream countershading coloring, kawaii cartoon style with scientifically accurate silhouette",
        "eyeDescriptor": "small round amber-orange eye with round black pupil and single bright catchlight, simple but lively, stylized minimal detail",
        "consistencyKeywords": [
          "chibi quetzalcoatlus",
          "oversized head",
          "long pointed beak",
          "small stubby wings",
          "pycnofiber-covered body",
          "warm brown and cream tones",
          "small round amber eye with catchlight",
          "2-3 head proportion"
        ]
      },
      "oilpainting": {
        "basePrompt": "A scientifically accurate Quetzalcoatlus northropi azhdarchid pterosaur, anatomically correct proportions with massive wingspan, long toothless beak, small sagittal crest, body covered in fine pycnofibers, warm brown dorsal and pale cream ventral countershading, naturally posed in prehistoric environment",
        "eyeDescriptor": "realistic detailed pterosaur eye with round bird-like pupil, dark amber-brown iris reflecting ambient environmental light, subtle catchlight conveying awareness and intelligence, anatomically accurate eye placement and scale based on extant archosaur relatives, no exaggeration",
        "consistencyKeywords": [
          "anatomically accurate quetzalcoatlus",
          "correct body proportions",
          "long toothless beak",
          "fine pycnofiber covering",
          "warm brown and cream countershading",
          "realistic bird-like eye with round pupil",
          "natural behavioral pose"
        ]
      }
    },
    "negativePrompt": "...(既存)",
    "styleModifiers": ["...(既存)"],
    "craftAnalysis": {
      "illustration": {
        "color": "warm earth tones with cream accents, soft contrast, limited palette",
        "rendering": "flat illustration with bold outlines, geometric simplification",
        "atmosphere": "friendly, approachable, educational clarity"
      },
      "oilpainting": {
        "color": "muted naturalistic earth tones, golden amber highlights, cool blue-grey shadows",
        "rendering": "acrylic paleoart painting, soft layered brushwork, atmospheric depth",
        "atmosphere": "serene documentary, environmental storytelling, prehistoric wilderness"
      }
    }
  }
}
```

#### A-2: 目の描写を独立フィールド化（`eyeDescriptor`）

**理由**: 目は画像品質に大きく影響する要素であり、basePrompt内に埋もれると以下の問題が起きる：
- プロンプト切り捨て時に目の指示が失われる
- AIが他の指示と目の指示を競合させる

`eyeDescriptor`を独立フィールドにし、`composeImagePrompt()`で**プロンプト末尾付近**に配置することで、AIの注意を確保する。

### Phase B: composeImagePrompt()のスタイル分岐対応（lib/character.js）

#### B-1: スタイル別属性の解決ロジック

```javascript
/**
 * スタイル別のキャラクター属性を解決する
 * styleOverrides[styleId]が存在すればそれを使用、なければデフォルトにフォールバック
 */
function resolveStyleAttributes(character, styleId) {
  const imgGen = character.imageGeneration;
  const overrides = imgGen.styleOverrides?.[styleId];

  return {
    basePrompt: overrides?.basePrompt || imgGen.basePrompt,
    eyeDescriptor: overrides?.eyeDescriptor || '',
    consistencyKeywords: overrides?.consistencyKeywords
      || character.appearance.consistencyKeywords,
    craftAnalysis: imgGen.craftAnalysis?.[styleId]
      || imgGen.craftAnalysis || {},
    styleModifiers: overrides?.styleModifiers || imgGen.styleModifiers || [],
  };
}
```

#### B-2: composeImagePrompt()の改修

```javascript
export function composeImagePrompt(diaryImagePrompt, character, styleId) {
  const style = getStyle(styleId);

  if (!character) {
    // 既存ロジック（変更なし）
    ...
  }

  // スタイル別属性を解決
  const resolved = resolveStyleAttributes(character, styleId);

  const composed = [
    resolved.basePrompt,
    `Scene: ${diaryImagePrompt}`,
    style ? `Art style: ${style.promptPrefix}` : null,
    `Style details: ${resolved.styleModifiers.join(', ')}`,
    `Important details: ${resolved.consistencyKeywords.join(', ')}`,
    // 目の描写をプロンプト末尾付近に独立配置（AI注意度向上）
    resolved.eyeDescriptor
      ? `Eye detail (IMPORTANT): ${resolved.eyeDescriptor}` : null,
    resolved.craftAnalysis.color
      ? `Color: ${resolved.craftAnalysis.color}. Rendering: ${resolved.craftAnalysis.rendering}. Atmosphere: ${resolved.craftAnalysis.atmosphere}`
      : '',
  ].filter(Boolean).join('. ');

  // ... 以降は既存と同じ
}
```

#### B-3: negativePromptのスタイル別マージ

パレオアートモード時に「kawaii, chibi, anime eyes, cartoon」をnegativePromptに追加し、スタイル汚染を防止。

```javascript
// character側のnegativePromptもスタイル別にする
const characterNegative = overrides?.negativePrompt || imgGen.negativePrompt;
```

### Phase C: エラー防止・品質保証

#### C-1: スタイル不整合検出（警告ログ）

```javascript
// composeImagePrompt内で、basePromptとstyleの矛盾を検出
const STYLE_CONFLICTS = {
  oilpainting: ['kawaii', 'chibi', 'cartoon', 'anime', 'cute chibi'],
  illustration: ['photorealistic', 'oil painting', 'acrylic'],
};

function detectStyleConflict(prompt, styleId) {
  const conflicts = STYLE_CONFLICTS[styleId] || [];
  const found = conflicts.filter(keyword =>
    prompt.toLowerCase().includes(keyword)
  );
  if (found.length > 0) {
    console.warn(`[STYLE_CONFLICT] styleId=${styleId}にスタイル不整合: ${found.join(', ')}`);
  }
  return found;
}
```

#### C-2: プロンプト長管理の強化

現状の3800文字スライスは雑な切り捨て。目の描写が切り捨てられないよう、優先度ベースの構成に変更：

```javascript
// 優先度: 高→低
const PRIORITY_SECTIONS = [
  { label: 'base', content: resolved.basePrompt, priority: 1 },
  { label: 'eye', content: eyeSection, priority: 2 },      // 目は高優先度
  { label: 'scene', content: sceneSection, priority: 3 },
  { label: 'style', content: styleSection, priority: 4 },
  { label: 'details', content: detailsSection, priority: 5 },
  { label: 'craft', content: craftSection, priority: 6 },
];
// DALL-E制限（1000文字）に収まるよう低優先度から削除
```

#### C-3: テスト追加

```javascript
// tests/character.test.js（新規）
describe('composeImagePrompt - スタイル別分岐', () => {
  it('illustration: chibi basePromptと小さい丸い目を使用', () => { ... });
  it('oilpainting: 写実的basePromptと鳥類型目を使用', () => { ... });
  it('oilpainting: negativePromptにkawaii/chibiが含まれる', () => { ... });
  it('不明なstyleId: デフォルトbasePromptにフォールバック', () => { ... });
  it('styleOverrides未定義: デフォルトにフォールバック', () => { ... });
  it('目の描写がプロンプト切り捨てで失われない', () => { ... });
  it('スタイル不整合検出が警告を出す', () => { ... });
});
```

#### C-4: スキーマ検証の拡張（lib/character.js）

```javascript
// validateCharacterSchema()にstyleOverridesの型チェックを追加
// - styleOverrides存在時、各キーがIMAGE_STYLESに存在するか確認
// - eyeDescriptorが文字列であること
// - 未知のスタイルキーは警告のみ（fail-openでブロックしない）
```

---

## 4. 変更ファイル一覧

| ファイル | 変更内容 | リスク |
|---------|----------|--------|
| `characters/quetz-default.json` | styleOverrides追加、eyeDescriptor追加 | 低: 後方互換あり |
| `lib/character.js` | resolveStyleAttributes追加、composeImagePrompt改修 | 中: 既存プロンプト構造変更 |
| `lib/image-styles.js` | 変更なし | - |
| `tests/character.test.js` | 新規テストファイル | なし |
| `api/generate-image.js` | 変更なし（character.jsが吸収） | - |

---

## 5. 実装順序

1. **`characters/quetz-default.json`の更新** — styleOverrides + eyeDescriptor追加
2. **`lib/character.js`の改修** — resolveStyleAttributes() + composeImagePrompt()改修
3. **スタイル不整合検出の追加** — detectStyleConflict()
4. **テスト作成** — tests/character.test.js
5. **全テスト実行** — `npm test`で既存168テスト + 新規テスト通過確認
6. **手動検証** — 両スタイルで画像生成し、目のレンダリングを目視確認

---

## 6. リスクと対策

| リスク | 対策 |
|--------|------|
| 既存のイラストモード画像品質が変わる | illustrationのstyleOverrideは現行basePromptとほぼ同一（目の記述のみ精密化） |
| フォールバック時の挙動変化 | Gemini/DALL-E両方でテスト。DALL-Eは1000文字制限があるため優先度ベース切り捨てが必須 |
| styleOverrides未定義の新スタイル追加時 | フォールバックロジックでデフォルトbasePromptを使用（fail-open） |
| プロンプト長超過 | PROMPT_WARN_THRESHOLDの既存警告 + 優先度ベース切り捨て |

---

## 7. 参考資料

### 参考画像
- `images/PteroSample.jpeg` — イラストモード目標（フラットイラスト、小さな丸い琥珀色の目）
- `images/Diarysample01-05.png` — パレオアートモード目標（Pablo Rivera風）

### Pablo Rivera氏スタイル調査
- サイト: https://pablonotpicasso.art/paleoart
- Instagram: https://www.instagram.com/pablonotpicasso/
- 主要特徴: 自然光ベース照明、環境主導型構図、アースカラー、静謐で観察的な雰囲気
- 目のレンダリング: 鳥類型丸瞳孔、環境光反射のキャッチライト、知性的眼差し
- 影響: Douglas Henderson（風景画的光と影）、BBCドキュメンタリー（行動描写）
- Keyframe Magazine Interview (2023): https://keyframemagazine.org/2023/06/05/pablo-rivera/

---

*作成日: 2026-03-23*
*ステータス: codex-review待ち*
