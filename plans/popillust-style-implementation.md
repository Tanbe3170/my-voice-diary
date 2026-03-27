# ポップイラスト調スタイル追加 実装計画書

## 概要

参照画像（WCS2011公式アート）の作風分析に基づき、新しい画像スタイル `popillust`（ポップイラスト調）を voice-diary システムに追加する。

## 参照画像の作風DNA分析

### 7軸分析結果

| 分析軸 | 特徴 | 確信度 |
|--------|------|--------|
| 画材・技法 | デジタルイラスト、ベクター的精密さ、筆跡/テクスチャなし | 確実 |
| 線画 | 太い黒アウトライン（外縁3-4px）、均一線幅、動的曲線、内部線は外縁の1/2 | 確実 |
| 着色 | 高彩度ポップカラー（電撃イエロー/ロイヤルパープル/エメラルドグリーン/ホットレッド/スカイブルー）、ダーク背景で色が映える、フラットベース＋セルシェーディング | 確実 |
| デフォルメ | ゲームキャラ準拠の誇張表現、アクション重視ポーズ | 確実 |
| 構図 | 中央螺旋/渦巻き構図、放射状バランス、主役が最大で中央配置 | 確実 |
| 表情 | エネルギッシュ、バトル態勢、大きな目・開いた口 | 確実 |
| 雰囲気 | ハイエナジー、ポップアート的、若々しく刺激的 | 確実 |

### 既存スタイルとの差異

| 特性 | illustration | oilpainting | **popillust（新規）** |
|------|-------------|-------------|----------------------|
| 色彩 | 限定暖色（ティール・茶赤・クリーム） | アースカラー（金琥珀・オークル） | 高彩度ポップカラー（6色以上） |
| 線画 | 太い幾何学的アウトライン | なし（筆跡表現） | 太い黒アウトライン＋セルシェーディング |
| 背景 | 紙の粒子テクスチャ | 大気遠近法 | ダーク背景＋動的エフェクト |
| 雰囲気 | 教育的・インフォグラフィック | 学術的・環境ストーリーテリング | エネルギッシュ・ポップアート |
| テクスチャ | 紙の粒感 | 柔らかい筆跡 | なし（スムース・デジタル） |

## プロンプト設計

### promptPrefix

DALL-E 3は `negativePrompt` を直接サポートしないため（Geminiは `Avoid:` 追記で対応）、重要な禁止事項は `promptPrefix` 側に統合する設計とする。

```
Dynamic pop-art digital illustration with bold thick black outlines and cel-shading, highly saturated vibrant color palette featuring electric yellow and royal purple and emerald green and hot red and sky blue, dark charcoal background with dynamic swirl or radial energy effects, flat color base with clean cel-shaded shadows, smooth digital finish with no paper texture or brush strokes, energetic action poses with expressive faces, characters as the prominent focal point against the dark background, tournament poster composition with dramatic impact, NOT photorealistic NOT oil painting NOT watercolor NOT muted colors NOT earth tones
```

**設計方針:** `promptPrefix` に `NOT ...` 形式で重要な禁止事項を含めることで、DALL-E 3経路でもスタイル逸脱を抑制する。Gemini経路では `negativePrompt` が `Avoid:` として追加されるため、二重の防御となる。

### negativePrompt

Gemini経路で `Avoid:` として追記される。DALL-E 3経路では使用されないため、上記 `promptPrefix` 側の `NOT` 指定と重複する内容を含む。

```
photorealistic, 3D render, oil painting, watercolor, soft brushstrokes, muted colors, earth tones, pastel colors, paper texture, canvas texture, gradient heavy, blurry, modern buildings, cars, roads, power lines, contemporary architecture, minimalist, calm composition, static pose
```

### バックエンド別の出力検証手順

実装後、以下の手順でDALL-E 3とGeminiの出力品質を比較検証する:

1. 同一の `image_prompt`（例: "A dinosaur roaring in a prehistoric forest"）を使用
2. Gemini（NB2）で生成 → ポップイラスト調の特徴（太いアウトライン、高彩度、ダーク背景）を確認
3. DALL-E 3で生成 → 同様の特徴が再現されているか確認
4. 禁止事項（油絵調、パステルカラー等）が混入していないか確認
5. 結果に基づきプロンプトを微調整

### claudeInstruction

```
画像プロンプトは、ポップアートイラスト調（太い黒アウトライン、セルシェーディング、高彩度のビビッドカラー（電撃イエロー・ロイヤルパープル・エメラルドグリーン・ホットレッド）、ダークな背景に動的エフェクト、アクションポーズ）で映える具体的なワンシーンを英語で記述。キャラクターはダーク背景の中で際立つよう配置し、躍動感のあるポーズや表情を含めること。現代的な風景は避け、ゲームポスターのような劇的なインパクト構図を心がけること。抽象的な比喩ではなく、日記の中核エピソードを1つのダイナミックな場面として描写すること。
```

## 変更対象ファイル一覧

### 1. lib/image-styles.js（スタイル定義追加）

**変更内容:** `IMAGE_STYLES` オブジェクトに `popillust` エントリを追加

```javascript
popillust: {
  name: 'ポップイラスト',
  promptPrefix: '...',  // 上記プロンプト
  negativePrompt: '...',
  claudeInstruction: '...',
},
```

**追加変更（セキュリティ）:** `isValidStyleId()` の実装を `styleId in IMAGE_STYLES` から `Object.hasOwn(IMAGE_STYLES, styleId)` に修正。`in` 演算子はプロトタイプ連鎖を辿るため、`__proto__` や `constructor` 等の入力を誤って許可するリスクがある。

```javascript
export function isValidStyleId(styleId) {
  return typeof styleId === 'string' && Object.hasOwn(IMAGE_STYLES, styleId);
}
```

**getStyle() の防御強化:** `getStyle()` も同様に `Object.hasOwn` で防御する。`IMAGE_STYLES[styleId] || null` だけでは `__proto__` 入力時にプロトタイプチェーン上のオブジェクトを返す可能性があるため、全ゲッター関数で `Object.hasOwn` チェックを統一する。

```javascript
export function getStyle(styleId) {
  if (typeof styleId !== 'string' || !Object.hasOwn(IMAGE_STYLES, styleId)) return null;
  return IMAGE_STYLES[styleId];
}
```

**テスト追加:** `getStyle('__proto__')` / `getStyle('constructor')` が `null` を返すことを確認するテストを追加。

**リスク:** 低。データ追加＋バリデーション強化のみ。

### 2. tests/image-styles.test.js（テスト追加）

**変更内容:**
- `popillust` スタイルの定義存在確認テスト追加
- `getStyle('popillust')` の返却値テスト追加
- `isValidStyleId('popillust')` のテスト追加
- `isValidStyleId('__proto__')` / `isValidStyleId('constructor')` が `false` を返すテスト追加（`Object.hasOwn` 化の検証）
- 既存のイテレーションテスト（`Object.entries(IMAGE_STYLES)` ループ）は自動対応

### 2.5. tests/generate-image.test.js（回帰テスト追加）

**変更内容:**
- `popillust` をstyleIdとして送信した正常系テスト追加
- 不正なstyleId（`__proto__` 等）が拒否されることの確認テスト追加
- `styleId='popillust'` で署名されたimageTokenでの正常通過テスト追加
- styleId改ざんテスト: `popillust` で署名したトークンに対し、リクエストで `styleId='illustration'` に改ざんした場合に `401` で拒否されることを確認

### 2.6. tests/create-diary-dino.test.js（回帰テスト追加、存在する場合）

**変更内容:**
- `popillust` スタイルでのClaude instruction取得テスト追加

### 3. docs/diary-input.html（フロントエンドUI）

**変更内容:** スタイル選択ラジオボタンに3つ目の選択肢を追加

```html
<label id="style-popillust-label" style="...">
  <input type="radio" name="imageStyle" value="popillust">
  <span>🎆 ポップイラスト調</span>
</label>
```

**モバイル対応:** ラジオボタンコンテナに `flex-wrap: wrap` を追加し、3ボタンがモバイル画面幅で折り返すようにする。

```html
<div style="display:flex;gap:12px;flex-wrap:wrap;">
```

**受け入れ条件:** スマートフォン表示（375px幅）でボタンが崩れずに折り返されることを確認。

**影響範囲:** ラジオボタンのイベントリスナーは既存の `document.querySelectorAll('input[name="imageStyle"]')` ループで動作するため、JSロジックの変更は最小限。

### 4. lib/character.js（スタイルコンフリクト定義）

**変更内容:** `STYLE_CONFLICTS` に `popillust` のコンフリクトルールを追加

```javascript
const STYLE_CONFLICTS = {
  oilpainting: ['kawaii', 'chibi', 'cartoon', 'anime', 'cute chibi'],
  illustration: ['photorealistic', 'oil painting', 'acrylic'],
  popillust: ['photorealistic', 'oil painting', 'watercolor', 'pastel', 'muted'],
};
```

**リスク:** 低。警告ログのみで処理を停止しない。

### 5. api/generate-image.js（変更なし）

`isValidStyleId()` ホワイトリスト方式のため、`image-styles.js` への追加で自動的にAPIが `popillust` を受け付ける。**コード変更不要。**

### 6. api/create-diary.js（変更なし）

`getStyleClaudeInstruction(styleId)` 経由でClaude指示を取得するため、**コード変更不要。**

## 実装手順

### Step 1: テスト追加（RED）
`tests/image-styles.test.js` に `popillust` 用テストを追加し、失敗を確認。

### Step 2: スタイル定義追加（GREEN）
`lib/image-styles.js` に `popillust` を追加。テスト通過を確認。

### Step 3: キャラクターシステム対応
`lib/character.js` の `STYLE_CONFLICTS` に `popillust` を追加。

### Step 4: フロントエンドUI追加
`docs/diary-input.html` にラジオボタンを追加＋スタイル切替ロジック確認。

### Step 5: テスト全体実行
`npm test` で全テスト通過を確認（既存テストへの影響がないこと）。

### Step 6: キャラクター styleOverrides 対応（任意・将来）
恐竜キャラクター JSON に `styleOverrides.popillust` を追加し、ポップイラスト調に最適化した外見描写を設定。

## リスク評価

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| DALL-E 3がポップアートスタイルを十分再現できない | 中 | 低 | プロンプト微調整で対応。Geminiバックエンドも利用可能 |
| 既存テストが壊れる | 低 | 中 | イテレーションテストが自動対応するため影響は最小 |
| フロントエンドレイアウト崩れ（3ボタン） | 低 | 低 | flex-wrap追加（変更手順に含む）＋スマホ375px表示確認 |
| キャラクター styleOverrides 未対応で表現品質が低い | 中 | 低 | basePrompt + style promptPrefixの組み合わせで最低限の品質は確保 |

## 作業時間見積

- Step 1-2（テスト＋スタイル定義）: 主要変更
- Step 3（character.js）: 1行追加
- Step 4（フロントエンド）: HTML追加＋JS微修正
- Step 5（テスト全体実行）: 確認

## 備考

- `popillust` というスタイルIDは既存の命名規則（英小文字連結）に準拠
- 恐竜テーマとの相性: WCS2011アートのクリーチャーデザインアプローチは恐竜キャラクターにも適用可能
- 将来的に `styleOverrides.popillust` をキャラクターJSONに追加することで、キャラクター固有のポップイラスト調表現を定義可能
