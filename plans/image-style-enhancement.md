# 画像スタイル強化 実装計画書

## 概要

日記画像生成の2つのスタイル（イラスト調・油絵調）のプロンプトを、参考画像の作風に近づけるよう改善する。
加えて、全スタイル共通で「現代的な風景を避ける」制約を実装する。

### 参考画像の作風分析

**イラスト調（PteroSample.jpeg準拠）:**
- フラットイラスト、太い形状、幾何学的な単純化
- 限定カラーパレット（ティール青、暖かみのある茶/赤、クリーム）
- 古生物学的な正確さを保った形状の単純化
- 教育的・インフォグラフィック的な明快さ
- テクスチャ感のある粒状表面（グレイン）

**油絵調（Pablo Rivera氏のパレオアート準拠）:**
- **媒体はアクリル**（油絵ではない） — 柔らかく抑制された筆跡
- 落ち着いたナチュラルな色彩（彩度は中〜低） — 金色/琥珀色、アースカラー主体
- ゴールデンアワーの劇的なライティング（逆光、光の散乱）
- 大気遠近法による奥行き表現（遠方の彩度低下、寒色シフト）
- 生物と環境の一体的統合（被写体は風景の一部として描写）
- 環境ストーリーテリング（地質・植物の詳細で場所を物語る）

### 現行プロンプトの課題

| 項目 | 現行（illustration） | 問題点 |
|------|---------------------|--------|
| promptPrefix | `Flat illustration style with bold thick outlines...` | 概ね正確だが、古生物学的正確さ・教育的明快さが欠落 |
| claudeInstruction | フラットイラスト調の指示 | 現代風景の排除指示が未記載 |

| 項目 | 現行（oilpainting） | 問題点 |
|------|---------------------|--------|
| promptPrefix | `Oil painting style with visible thick impasto brushstrokes, rich saturated colors...` | **3つの重大な誤り**: (1) 油絵→アクリル (2) 厚塗りインパスト→柔らかい筆跡 (3) 鮮やかな彩度→落ち着いたナチュラルカラー |
| negativePrompt | `photorealistic, flat, vector, cartoon, digital, clean lines` | 不足: 現代的要素の排除が欠落 |
| claudeInstruction | 油絵調の指示 | 環境統合・大気遠近法・行動描写の指示が欠落 |

---

## 変更対象ファイル一覧

| # | ファイル | 変更内容 | リスク |
|---|---------|---------|--------|
| 1 | `lib/image-styles.js` | promptPrefix, negativePrompt, claudeInstruction の全面改訂 | 低（テスト修正で対応） |
| 2 | `lib/character.js` | `composeImagePrompt`にプロンプト長ガード追加 | 低 |
| 3 | `lib/image-backend.js` | `generateWithDalle`にDALL-E 3専用プロンプト切り詰め（1000文字）追加 | 低 |
| 4 | `tests/image-styles.test.js` | アサーション文字列の更新 | 低 |
| 5 | `tests/create-diary-dino.test.js` | L353 `'油絵調'` → claudeInstruction動的取得に変更 | 低 |
| 6 | `tests/character.test.js` | プロンプト長警告テスト追加（キャラクターあり/なし両パス） | 低 |
| 7 | `tests/image-backend.test.js` | DALL-E 3プロンプト切り詰めテスト追加 | 低 |
| 8 | `docs/diary-input.html` | UI表示名「油絵調」→「パレオアート調」 | 低 |

**変更不要ファイル:** `api/generate-image.js`, `api/create-diary.js`
→ これらはstyleIdで間接参照しており、スタイル定義の内容変更の影響を受けない

---

## 詳細変更仕様

### 1. `lib/image-styles.js` — スタイル定義の改訂

#### 1.1 illustration（フラットイラスト）

```javascript
illustration: {
  name: 'フラットイラスト',
  promptPrefix: 'Flat illustration style with bold geometric shapes and thick clean outlines, limited warm color palette of teal blue and earthy brown-red and cream, subtle paper grain texture, clean composition with paleontological accuracy in simplified forms, educational infographic clarity, set in a timeless prehistoric or natural landscape with no modern elements',
  negativePrompt: 'photorealistic, 3D render, photograph, blurry, gradient heavy, modern buildings, cars, roads, power lines, smartphones, contemporary architecture',
  claudeInstruction: '画像プロンプトは、フラットイラスト調（太い輪郭線、幾何学的に単純化された形状、ティール青・茶赤・クリームの限定パレット、古生物学的な正確さ）で映える具体的なワンシーンを英語で記述。現代的な風景（ビル、車、電線、スマートフォン）は避け、太古の自然や素朴な風景を背景にすること。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
},
```

**変更点:**
- `promptPrefix`: 「paleontological accuracy in simplified forms」「educational infographic clarity」追加。パレット色名を具体化（teal blue, earthy brown-red, cream）。「timeless prehistoric or natural landscape with no modern elements」追加
- `negativePrompt`: 現代的要素（modern buildings, cars, roads, power lines, smartphones, contemporary architecture）追加
- `claudeInstruction`: 現代風景排除の明示指示を追加

**文字数確認（promptPrefix）:** 約280文字 — DALL-E 3の1000文字制限内

#### 1.2 oilpainting（パレオアート・アクリル画）

```javascript
oilpainting: {
  name: 'パレオアート',
  promptPrefix: 'Acrylic paleoart painting style with soft layered brushwork and restrained visible strokes, muted naturalistic earth-tone palette dominated by golden amber and warm ochre with cool blue-grey atmospheric accents, golden-hour directional lighting with atmospheric haze and backlighting, creatures naturally integrated into rich prehistoric ecosystem context showing behavioral interaction, deep atmospheric perspective with foreground botanical detail fading to desaturated cool distant landscape, environmental storytelling through geological and botanical elements, set in an ancient undisturbed wilderness',
  negativePrompt: 'photorealistic, flat, vector, cartoon, digital, clean lines, vibrant saturated colors, modern buildings, cars, roads, power lines, contemporary infrastructure, thick impasto texture',
  claudeInstruction: '画像プロンプトは、パレオアート調（アクリル画風の柔らかい筆跡、金色・琥珀色・アースカラーの落ち着いた自然色、ゴールデンアワーの劇的な照明、大気遠近法による奥行き）で映える具体的なワンシーンを英語で記述。生物は風景の一部として自然に統合し、行動的な文脈（捕食、移動、群れの交流）を含めること。現代的な風景（ビル、車、電線、スマートフォン）は避け、太古の原生自然を背景にすること。抽象的な比喩ではなく、日記の中核エピソードを環境ストーリーテリング（地質・植生の詳細）を含む1つの場面として描写すること。',
},
```

**変更点:**
- `name`: 「油絵」→「パレオアート」（実際のmediumに合わせ、UI上の表示名も変更）
- `promptPrefix`: 全面改訂。油絵→アクリル、インパスト→柔らかい筆跡、鮮やかな彩度→落ち着いたアースカラー。大気遠近法、ゴールデンアワー、環境統合、行動的文脈を追加。「ancient undisturbed wilderness」で現代風景を排除
- `negativePrompt`: 「vibrant saturated colors」「thick impasto texture」「modern buildings, cars, roads, power lines, contemporary infrastructure」追加
- `claudeInstruction`: 環境統合・行動描写・大気遠近法・環境ストーリーテリングの指示を追加。現代風景排除を明記

**文字数確認（promptPrefix）:** 約520文字 — DALL-E 3の1000文字制限内（composeImagePrompt合成後も余裕あり）

### 2. `lib/character.js` — プロンプト長ガード追加

#### 2.1 `composeImagePrompt` のプロンプト長安全対策

**現状:** キャラクター合成時のみ `.slice(0, 3800)` があるが、以下の問題がある：
- キャラクターなしパス（`style.promptPrefix + ". " + diaryImagePrompt`）に長さ制限がない
- DALL-E 3の制限は1000文字だが、Geminiはより長いプロンプトを受け付ける
- 画像バックエンド側（`image-backend.js`）で切り詰めるのが適切だが、現行設計ではバックエンド選択前にプロンプトが合成済み

**対策（2段構え）:**

**(a) `composeImagePrompt` での警告ログ:** 両パス（キャラクターあり/なし）で900文字超の場合に警告。Geminiは長プロンプトを正常処理するため、ここでは切り詰めない。

```javascript
// composeImagePrompt内、return直前に追加
const MAX_PROMPT_WARN = 900; // DALL-E 3安全マージン
if (result.prompt.length > MAX_PROMPT_WARN) {
  console.warn(`画像プロンプト長警告: ${result.prompt.length}文字 (推奨上限: ${MAX_PROMPT_WARN})`);
}
```

**(b) `generateWithDalle` でのDALL-E 3専用切り詰め:** DALL-E 3に渡す直前で1000文字に切り詰める。Geminiには影響しない。

```javascript
// generateWithDalle内、fetch呼び出し前に追加
const DALLE_MAX_PROMPT = 1000;
if (prompt.length > DALLE_MAX_PROMPT) {
  console.warn(`DALL-E 3プロンプト切り詰め: ${prompt.length} → ${DALLE_MAX_PROMPT}文字`);
  prompt = prompt.slice(0, DALLE_MAX_PROMPT);
}
```

**理由:**
- DALL-E 3は1000文字超プロンプトでGPT-4自動書き換えが介入し、スタイル指示が失われるリスクがある
- Geminiは長いプロンプトを正常処理するため、`composeImagePrompt`では切り詰めない
- DALL-E 3固有の制限はDALL-E 3固有の関数内で対処するのが責務分離として適切
- `composeImagePrompt`の警告ログは、将来的なプロンプト最適化の判断材料として残す

### 3. `lib/image-backend.js` — DALL-E 3専用プロンプト切り詰め

#### 3.1 `generateWithDalle` にプロンプト長制限を追加

`generateWithDalle` 関数の引数 `prompt` をfetch呼び出し前に1000文字で切り詰める。
`prompt` 引数は `const` ではなく `let` に変更する（既存コードは引数を直接使用しているため、関数先頭でローカル変数に代入するかletに変更）。

```javascript
// generateWithDalle関数内、fetchOpts定義の直前に追加
const DALLE_MAX_PROMPT = 1000;
if (prompt.length > DALLE_MAX_PROMPT) {
  console.warn(`DALL-E 3プロンプト切り詰め: ${prompt.length} → ${DALLE_MAX_PROMPT}文字`);
  prompt = prompt.slice(0, DALLE_MAX_PROMPT);
}
```

**注意:** 関数シグネチャの `prompt` 引数は再代入されるため、関数先頭でローカル変数にコピーするか、切り詰め結果を別変数に保持して以降で使用する。

### 4. `tests/image-styles.test.js` — テスト修正

以下のアサーションを更新：

| 行 | 現行 | 修正後 |
|----|------|--------|
| L23 | `expect(IMAGE_STYLES.oilpainting.name).toBe('油絵')` | `expect(IMAGE_STYLES.oilpainting.name).toBe('パレオアート')` |
| L69 | `expect(style.name).toBe('油絵')` | `expect(style.name).toBe('パレオアート')` |
| L70 | `expect(style.promptPrefix).toContain('Oil painting')` | `expect(style.promptPrefix).toContain('paleoart')` |

**変更不要:**
- L63: `toContain('Flat illustration')` — 維持
- L116: `toContain('Flat illustration')` — 維持
- L127: `toContain('photorealistic')` — 維持（negativePromptに含まれるため）
- L138: `toContain('フラットイラスト調')` — 維持

### 5. `tests/create-diary-dino.test.js` — claudeInstruction文字列の更新

L353で `lastClaudePrompt` に `'油絵調'` が含まれることをチェックしているが、claudeInstructionを「パレオアート調」に変更するため回帰する。

**修正方針:** 固定文字列ではなく、`getStyleClaudeInstruction('oilpainting')` の一部を動的に検証するか、`'パレオアート調'` に更新する。

| 行 | 現行 | 修正後 |
|----|------|--------|
| L353 | `expect(lastClaudePrompt).toContain('油絵調')` | `expect(lastClaudePrompt).toContain('パレオアート調')` |

### 6. `tests/character.test.js` — プロンプト長警告テスト追加

`composeImagePrompt` の警告ログ動作を検証するテストを追加。

```javascript
// 追加テストケース
it('900文字超のプロンプトで警告ログが出力されること（キャラクターなし）', () => {
  const warnSpy = vi.spyOn(console, 'warn');
  const longPrompt = 'A'.repeat(800); // style.promptPrefix + ". " + longPrompt > 900
  const result = composeImagePrompt(longPrompt, null, 'oilpainting');
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('画像プロンプト長警告'));
  warnSpy.mockRestore();
});

it('短いプロンプトで警告ログが出力されないこと', () => {
  const warnSpy = vi.spyOn(console, 'warn');
  const shortPrompt = 'A short prompt';
  composeImagePrompt(shortPrompt, null, 'illustration');
  expect(warnSpy).not.toHaveBeenCalled();
  warnSpy.mockRestore();
});
```

### 7. `tests/image-backend.test.js` — DALL-E 3切り詰めテスト追加

`generateWithDalle` が1000文字超プロンプトを切り詰めることを検証。

```javascript
// 追加テストケース（既存のDALL-E 3テストグループ内）
it('1000文字超のプロンプトが切り詰められること', async () => {
  const longPrompt = 'A'.repeat(1500);
  // fetchモックでリクエストbodyのprompt長を検証
  // → body.prompt.length === 1000 であること
});
```

### 8. `docs/diary-input.html` — UI表示名の更新

| 行 | 現行 | 修正後 |
|----|------|--------|
| L50 | `🖼️ 油絵調` | `🖼️ パレオアート調` |

**注意:** styleIdの値 `oilpainting` は変更しない（後方互換性維持のため、既存日記のfrontmatterに `image_style: "oilpainting"` が記録されている）。

---

## エラー防止の観点

### 3.1 プロンプト長超過（DALL-E 3: 1000文字制限）

| リスク | 発生条件 | 対策 |
|--------|---------|------|
| promptPrefix + diaryImagePrompt が1000文字超 | oilpaintingの長いpromptPrefix（~520文字）+ 長いimage_prompt（最大500文字） | 2段構え: (1) `composeImagePrompt`で900文字超時に警告ログ出力 (2) `generateWithDalle`でDALL-E 3専用に1000文字で切り詰め。Geminiには影響なし |
| キャラクター合成時にさらに長くなる | character.basePrompt + stylePrefix + keywords | 既存の`.slice(0, 3800)`ガードで対応済み |

### 3.2 DALL-E 3のアーティスト名拒否

| リスク | 発生条件 | 対策 |
|--------|---------|------|
| プロンプトが拒否される | アーティスト名を含む場合 | promptPrefixにアーティスト名を**含めない**。スタイル特徴を記述的に表現（「acrylic paleoart painting style」等）。claudeInstructionにもアーティスト名は含めない |

### 3.3 DALL-E 3の自動プロンプト書き換え

| リスク | 発生条件 | 対策 |
|--------|---------|------|
| 「現代風景を避ける」指示が書き換えで失われる | GPT-4の自動拡張時 | 肯定的フレーミング（「prehistoric wilderness」「ancient undisturbed landscape」）で記述。否定形（「no modern...」）は書き換えで無視されやすいため、肯定形と否定形の両方で指定 |

### 3.4 スタイル切替時の整合性

| リスク | 発生条件 | 対策 |
|--------|---------|------|
| imageToken署名とstyleId不一致 | フロントエンドでスタイル変更後に画像生成 | 既存のHMAC署名検証でstyleIdを含めて検証済み（`image-token.js`） — 追加対策不要 |
| 既存日記のimage_style: "oilpainting"との互換性 | styleId値を変更した場合 | styleIdの値 `oilpainting` は**変更しない**。nameのみ「パレオアート」に変更 |

### 3.5 テスト回帰

| リスク | 発生条件 | 対策 |
|--------|---------|------|
| promptPrefix文字列チェックの失敗 | `toContain('Oil painting')` | テスト修正（`toContain('paleoart')`に変更） |
| name文字列チェックの失敗 | `toBe('油絵')` | テスト修正（`toBe('パレオアート')`に変更） |
| claudeInstruction文字列の回帰 | `tests/create-diary-dino.test.js` L353 `toContain('油絵調')` | テスト修正（`toContain('パレオアート調')`に変更） |
| character.test.jsの動的チェック | `toContain(style.promptPrefix)` | 影響なし（動的に取得するため） |
| プロンプト長ガードのテスト未整備 | 新規追加のconsole.warn | `tests/character.test.js`に警告テスト追加 |
| DALL-E切り詰めのテスト未整備 | 新規追加の1000文字切り詰め | `tests/image-backend.test.js`に切り詰めテスト追加 |

### 3.6 Gemini「Avoid:」構文の適切な活用

| リスク | 発生条件 | 対策 |
|--------|---------|------|
| negativePromptがGeminiで効かない | Gemini APIがAvoid:を無視 | `image-backend.js`の既存実装（`Avoid: ${negativePrompt}`追記）で対応済み。negativePromptに現代的要素を明記することで効果を最大化 |

---

## 実装順序

1. `lib/image-styles.js` — スタイル定義の全面改訂
2. `lib/character.js` — プロンプト長ガード追加
3. `lib/image-backend.js` — DALL-E 3専用プロンプト切り詰め追加
4. `tests/image-styles.test.js` — テストアサーション更新
5. `tests/create-diary-dino.test.js` — claudeInstruction文字列更新
6. `tests/character.test.js` — プロンプト長警告テスト追加
7. `tests/image-backend.test.js` — DALL-E 3切り詰めテスト追加
8. `docs/diary-input.html` — UI表示名更新
9. `npm test` — 全テスト通過確認

---

## テスト計画

### 自動テスト（修正対象）
- `tests/image-styles.test.js`: oilpaintingのname・promptPrefix文字列アサーション更新
- `tests/create-diary-dino.test.js`: L353 `'油絵調'` → `'パレオアート調'` に更新
- `tests/character.test.js`: プロンプト長警告テスト追加（キャラクターあり/なし両パス）
- `tests/image-backend.test.js`: DALL-E 3プロンプト切り詰めテスト追加
- 全テストスイート通過確認（`npm test`）

### 手動テスト（実装後に推奨）
- Vercelプレビューデプロイで以下を確認:
  1. illustrationスタイルで日記作成→画像生成 → 現代風景が出ないこと
  2. oilpaintingスタイルで日記作成→画像生成 → パレオアート調の画像が出ること
  3. 恐竜ストーリーモード + キャラクター + 各スタイルで画像生成可能なこと

---

## 影響範囲サマリー

- **変更ファイル数:** 8ファイル（lib 3, tests 4, docs 1）
- **API互換性:** 完全互換（styleId値 `oilpainting` / `illustration` は変更なし）
- **フロントエンド互換性:** 表示名のみ変更（「油絵調」→「パレオアート調」）
- **既存日記互換性:** 影響なし（frontmatterの `image_style: "oilpainting"` はそのまま有効）
- **新規環境変数:** なし
- **新規依存パッケージ:** なし
