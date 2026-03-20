# 画像生成スタイル強化計画

## 概要

日記の画像生成システムに以下の2つの改善を施す：

1. **スタイル選択機能**: フラットイラスト調（サンプル画像参照）または油絵調を選択可能にする
2. **内容伝達力の向上**: 日記の内容がひと目で読み手に伝わる画像を生成する

## 現状分析

### 画像生成フロー（現在）

```
ユーザー入力 → Claude API（image_prompt生成） → Markdown保存
  → generate-image API → GitHub読み込み → image_prompt抽出
  → composeImagePrompt()（キャラクター合成） → NB2/NBpro/DALL-E 3
```

### 現在の問題点

1. **スタイル制御が不十分**
   - Claudeへの指示が「画像プロンプトは情景が浮かぶような具体的な英語で記述」のみ
   - NB2（Gemini）へのスタイル指示がプロンプト内テキストのみ（APIパラメータなし）
   - キャラクターモードのstyleModifiersは `["soft lighting", "warm color palette", ...]` で具体的な画風指定がない

2. **内容伝達力が低い**
   - image_promptが抽象的（例: "A person standing at a crossroads..."）
   - 日記の具体的なエピソードではなく、テーマの比喩表現になりがち
   - キャラクターなし時は「A person」という汎用的な被写体

3. **スタイル選択UIなし**
   - フロントエンドにスタイル選択の仕組みがない

### デフォルト画像生成バックエンド

**NB2（Gemini 3.1 Flash Image Preview）がプライマリ**。フォールバックチェーン:
1. NB2（Gemini） ← デフォルト
2. NBpro（Gemini）
3. DALL-E 3（2026年5月12日廃止予定）

Gemini APIはスタイルパラメータを持たないため、**プロンプト内でのスタイル制御が主要手段**。

---

## 修正計画

### Phase 1: スタイル定義とプロンプトテンプレート設計

#### 1.1 スタイル定義ファイル作成

**新規ファイル:** `api/lib/image-styles.js`

```javascript
// 画像生成スタイル定義
export const IMAGE_STYLES = {
  illustration: {
    name: 'フラットイラスト',
    promptPrefix: 'Flat illustration style with bold thick outlines, simple geometric shapes, limited warm color palette, subtle grain texture, clean composition, modern graphic design aesthetic, no photorealism',
    negativePrompt: 'photorealistic, 3D render, photograph, blurry, gradient heavy',
    claudeInstruction: '画像プロンプトは、フラットイラスト調（太い輪郭線、シンプルな形状、限定カラーパレット）で映える具体的なワンシーンを英語で記述。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
  },
  oilpainting: {
    name: '油絵',
    promptPrefix: 'Oil painting style with visible thick impasto brushstrokes, rich saturated colors, oil on canvas texture, warm dramatic lighting, painterly quality, artistic composition',
    negativePrompt: 'photorealistic, flat, vector, cartoon, digital, clean lines',
    claudeInstruction: '画像プロンプトは、油絵調（厚塗りの筆跡、濃厚な色彩、キャンバス質感）で映える具体的なワンシーンを英語で記述。抽象的な比喩ではなく、日記の中核エピソードを1つの印象的な場面として描写すること。',
  },
};

export const DEFAULT_STYLE = 'illustration';

/**
 * styleIdからスタイル定義を取得する（フォールバックなし）
 * @param {string} styleId
 * @returns {object|null} スタイル定義。不明なstyleIdはnullを返す
 */
export function getStyle(styleId) {
  return IMAGE_STYLES[styleId] || null;
}

/**
 * styleIdのバリデーション（ホワイトリスト方式）
 * @param {string} styleId
 * @returns {boolean}
 */
export function isValidStyleId(styleId) {
  return typeof styleId === 'string' && styleId in IMAGE_STYLES;
}

export function getStylePromptPrefix(styleId) {
  return getStyle(styleId).promptPrefix;
}

export function getStyleNegativePrompt(styleId) {
  return getStyle(styleId).negativePrompt;
}

export function getStyleClaudeInstruction(styleId) {
  return getStyle(styleId).claudeInstruction;
}
```

#### 1.2 サンプル画像の作風分析に基づくイラスト調プロンプト

参照画像（PteroSample.jpeg）の特徴:
- **線画**: 太くクリーンな輪郭線、エッジがシャープ
- **着色**: フラットカラーに微細なグラデーション、暖色系（ティール、ブラウン、クリーム）
- **形状**: 誇張されたプロポーション、シンプルな幾何学的形状
- **質感**: 微細なグレインテクスチャ、紙のような質感
- **構図**: 被写体中心、白背景、テキスト配置あり
- **雰囲気**: モダンでスタイリッシュ、フレンドリー

この分析をプロンプトに反映済み。

---

### Phase 2: Claude APIプロンプト改修（create-diary.js）

#### 2.1 image_prompt生成指示の強化

**変更対象:** `api/create-diary.js`

##### 2.1.1 JSON_OUTPUT_SCHEMA関数の修正

現在の `image_prompt` フィールド説明:
```
"image_prompt": "この日記から1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）"
```

修正後（スタイル対応 + 内容伝達強化）:
```
"image_prompt": "この日記の中核エピソードを1つの具体的な場面として描写する英語プロンプト（AI画像生成用）。抽象的な比喩や概念図ではなく、読者が画像を見ただけで日記の内容がわかるような印象的なワンシーンを詳細に記述する。被写体の行動・表情・場所・時間帯・周辺のディテールを具体的に含めること。"
```

##### 2.1.2 buildNormalPrompt関数の修正

整形ルール6番を強化:
```
現在: 6. 画像プロンプトは情景が浮かぶような具体的な英語で記述
修正: 6. 画像プロンプトは日記の中核エピソードを1つの具体的なシーンとして英語で記述する。「A person at a crossroads」のような抽象的比喩ではなく、「A woman laughing while her cat knocks over a coffee cup at a sunny kitchen table」のような具体的場面を描写すること。読者が画像だけで日記の内容を推測できるレベルの具体性が必要。
```

##### 2.1.3 buildDinoStoryPrompt関数の修正

整形ルール5番を強化:
```
現在: 5. image_promptは「恐竜が現代にいる」情景を具体的に描写する
修正: 5. image_promptは日記の中核エピソードに恐竜を組み込んだ具体的なワンシーンを英語で記述する。読者が画像だけで日記の内容を推測できるレベルの具体性が必要。
```

#### 2.2 styleIdの受け渡し

**フロー:**
```
フロントエンド（styleId選択）
  → create-diary API（styleId受信 → Claudeプロンプトに反映 → レスポンスに含める）
  → generate-image API（styleId受信 → プロンプト合成に使用）
```

##### 2.2.1 create-diary.jsの変更

1. リクエストボディから `styleId` を受け取る（**必須パラメータ**: 未指定時は400エラー）
2. `styleId` のバリデーション（`IMAGE_STYLES` のキーに含まれるかチェック、不正値・未指定は400エラー）
3. Claude APIプロンプトにスタイル固有の指示を注入
4. **レスポンスに必ず `styleId` を含める**（フロントがgenerate-imageに伝搬するため。フロントUI既定値として `illustration` が送信されるので、レスポンスにもその値が返る）
5. **imageTokenのHMAC署名に `styleId` を常に明示的に含める**（改ざん防止、省略不可）

##### 2.2.2 HMAC署名の変更

現在のペイロード: `date:filePath:characterId:mode:timestamp`
修正後: `date:filePath:characterId:mode:styleId:timestamp`

**HMAC計算の共通化:** create-diary.js と generate-image.js の両方で同一のペイロード構築ロジックを使用するため、共通ユーティリティ関数を `api/lib/image-token.js` に切り出す:

```javascript
// api/lib/image-token.js
import crypto from 'crypto';

/**
 * imageToken用のHMACペイロードを構築する（create/generate共通）
 * styleIdは常に明示的に含める（省略不可）
 */
/**
 * imageToken用のHMACペイロードを構築する（create/generate共通）
 * 全パラメータは呼び出し元で必須検証済みであること（デフォルト補完なし）
 * @throws {Error} 必須パラメータ（date, styleId, timestamp）が欠落時
 */
export function buildTokenPayload({ date, filePath, characterId, mode, styleId, timestamp }) {
  if (!date || !styleId || !timestamp) {
    throw new Error('buildTokenPayload: date, styleId, timestamp are required');
  }
  const parts = [date];
  if (filePath) parts.push(filePath);
  parts.push(characterId || '', mode || 'normal', styleId, String(timestamp));
  return parts.join(':');
}

export function generateImageToken(params, secret) {
  const payload = buildTokenPayload(params);
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${params.timestamp}:${hmac}`;
}

/**
 * imageTokenの検証（fail-closed設計）
 *
 * 検証手順:
 * 1. imageToken形式検証: "timestamp:hmac" 形式であること
 * 2. timestamp: 数値文字列であること
 * 3. hmac: 64文字のhex文字列であること（SHA-256）
 * 4. TTL検証: 5分以内であること
 * 5. HMAC再計算 + timingSafeEqual比較
 *
 * 異常系はすべて { valid: false, reason } を返す（例外を外に出さない）
 * @returns {{ valid: boolean, reason?: string, timestamp?: number }}
 */
export function verifyImageToken(imageToken, params, secret) {
  // 1. 形式検証
  if (typeof imageToken !== 'string') {
    return { valid: false, reason: 'token_not_string' };
  }
  const colonIdx = imageToken.indexOf(':');
  if (colonIdx === -1) {
    return { valid: false, reason: 'token_format_invalid' };
  }
  const tsStr = imageToken.slice(0, colonIdx);
  const providedHmac = imageToken.slice(colonIdx + 1);

  // 2. timestamp検証
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { valid: false, reason: 'timestamp_invalid' };
  }

  // 3. hmac形式検証（SHA-256 = 64文字hex）
  if (!/^[0-9a-f]{64}$/.test(providedHmac)) {
    return { valid: false, reason: 'hmac_format_invalid' };
  }

  // 4. TTL検証（5分 = 300,000ms）
  if (Date.now() - ts > 300_000) {
    return { valid: false, reason: 'token_expired' };
  }

  // 5. HMAC再計算 + timingSafeEqual
  try {
    const payload = buildTokenPayload({ ...params, timestamp: tsStr });
    const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const valid = crypto.timingSafeEqual(
      Buffer.from(providedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
    return { valid, timestamp: ts, reason: valid ? undefined : 'hmac_mismatch' };
  } catch {
    return { valid: false, reason: 'verification_error' };
  }
}
```

これにより、create-diary.js と generate-image.js 間のペイロード不一致リスクを構造的に排除する。

#### 2.3 スタイル指示の注入ポイント

```javascript
// buildNormalPrompt() 内
function buildNormalPrompt(rawText, today, styleInstruction) {
  return `あなたは日記執筆のアシスタントです。...

【整形のルール】
...
6. ${styleInstruction}
...`;
}
```

`styleInstruction` は `getStyleClaudeInstruction(styleId)` から取得。

---

### Phase 3: 画像生成API改修（generate-image.js）

#### 3.1 styleIdの受信と検証

1. リクエストボディから `styleId` を受け取る（**必須**: 未指定時は400エラー）
2. `styleId` のホワイトリスト検証（`IMAGE_STYLES` のキー、不正値・未指定は400エラー）
3. `verifyImageToken()` を使用してHMAC署名検証（styleId含む）
4. `verifyImageToken()` が `{ valid: false }` を返した場合は `reason` に応じて400/401を返す

#### 3.2 プロンプト合成の改修

**変更対象:** `api/lib/character.js` の `composeImagePrompt()`

```javascript
// 現在
export function composeImagePrompt(diaryImagePrompt, character) { ... }

// 修正後
export function composeImagePrompt(diaryImagePrompt, character, styleId) {
  const style = getStyle(styleId);

  if (!character) {
    // キャラクターなし: スタイルプレフィックス + 日記プロンプト
    return {
      prompt: `${style.promptPrefix}. ${diaryImagePrompt}`,
      negativePrompt: style.negativePrompt,
    };
  }

  // キャラクターあり: キャラクター設定 + スタイル + 日記プロンプト
  const { basePrompt, styleModifiers, negativePrompt, craftAnalysis } = character.imageGeneration;
  const { consistencyKeywords } = character.appearance;

  const composed = [
    basePrompt,
    `Scene: ${diaryImagePrompt}`,
    `Art style: ${style.promptPrefix}`,
    `Style details: ${styleModifiers.join(', ')}`,
    `Important details: ${consistencyKeywords.join(', ')}`,
    craftAnalysis
      ? `Color: ${craftAnalysis.color}. Rendering: ${craftAnalysis.rendering}. Atmosphere: ${craftAnalysis.atmosphere}`
      : '',
  ].filter(Boolean).join('. ');

  // negativePromptはスタイルとキャラクターの両方をマージ
  const mergedNegative = [negativePrompt, style.negativePrompt]
    .filter(Boolean).join(', ');

  return {
    prompt: composed.slice(0, 3800),
    negativePrompt: mergedNegative,
  };
}
```

#### 3.3 Gemini NB2へのプロンプト送信（変更なし）

現在の `generateWithGemini()` は `prompt` と `negativePrompt` を結合して送信:
```javascript
const fullPrompt = negativePrompt
  ? `${prompt}\n\nAvoid: ${negativePrompt}`
  : prompt;
```

この仕組みはそのまま活用可能。スタイル情報はプロンプト内に含まれるため、Gemini APIへの変更は不要。

---

### Phase 4: フロントエンド改修（diary-input.html）

#### 4.1 スタイル選択UI追加

日記作成フォームに画像スタイル選択セクションを追加:

```html
<div class="style-selector">
  <label>画像スタイル:</label>
  <div class="style-options">
    <label class="style-option selected">
      <input type="radio" name="imageStyle" value="illustration" checked>
      <span class="style-preview">🎨</span>
      <span class="style-name">イラスト調</span>
    </label>
    <label class="style-option">
      <input type="radio" name="imageStyle" value="oilpainting">
      <span class="style-preview">🖼️</span>
      <span class="style-name">油絵調</span>
    </label>
  </div>
</div>
```

#### 4.2 リクエストへのstyleId追加

`buildImageRequestBody()` に `styleId` を追加:

**変更対象:** `docs/js/build-image-request.js`

```javascript
export function buildImageRequestBody({ date, imageToken, filePath, characterId, mode, styleId }) {
  const body = { date, imageToken };
  if (filePath) body.filePath = filePath;
  if (characterId) body.characterId = characterId;
  if (mode && mode !== 'normal') body.mode = mode;
  // styleIdは必須（HMAC署名と一致させるため）
  body.styleId = styleId;
  return body;
}
```

#### 4.3 create-diaryリクエストへのstyleId追加

日記作成リクエスト時にも `styleId` を送信:

```javascript
const requestBody = {
  text: diaryText,
  mode: selectedMode,
  styleId: document.querySelector('input[name="imageStyle"]:checked')?.value || 'illustration',
  // ... 既存フィールド
};
```

#### 4.4 generate-image呼び出し時のstyleId伝搬

**重要:** `create-diary` レスポンスから `styleId` を受け取り、`generate-image` に必ず渡す:

```javascript
// create-diary レスポンス後
if (result.imageToken && result.date) {
  const imgRequestBody = buildImageRequestBody({
    date: result.date,
    imageToken: result.imageToken,
    filePath: result.filePath,
    characterId: result.characterId,
    mode: result.mode,
    styleId: result.styleId  // 必須: create-diaryレスポンスから受け取ったstyleIdをそのまま渡す
  });
  // ...
}
```

`create-diary` レスポンスには常に `styleId` を含める（デフォルト `'illustration'` 含む）。

---

### Phase 5: YAML Front Matter拡張

#### 5.1 styleIdの保存

生成された日記MarkdownのYAML Front Matterに `image_style` を追加:

```yaml
---
title: "タイトル"
date: 2026-03-20
tags: [...]
image_prompt: "..."
image_style: "illustration"
---
```

**注意:** `image_style` は記録・閲覧目的のみ。generate-image APIはリクエストボディの `styleId` のみを認証・描画に使用する（Markdownフォールバックは行わない）。これにより、HMAC検証前にGitHub読み込みが必要になる矛盾を回避する。

#### styleIdの単一ソース原則

| 用途 | ソース | 備考 |
|------|--------|------|
| HMAC署名生成 | create-diaryリクエストボディの `styleId` | 署名時に正規化済み |
| HMAC署名検証 | generate-imageリクエストボディの `styleId` | フロントから伝搬 |
| プロンプト合成 | generate-imageリクエストボディの `styleId` | HMAC検証後に使用 |
| YAML保存 | create-diary処理時の `styleId` | 記録目的のみ |

**Markdownからの `image_style` 読み込みは一切行わない。** `styleId` の唯一の信頼ソースはリクエストボディであり、これによりHMAC検証順序（認証→GitHub読み込み→画像生成）の一貫性を保証する。

---

### Phase 6: テスト追加

#### 6.1 image-styles.jsのユニットテスト

**新規ファイル:** `tests/image-styles.test.js`

- `getStyle('illustration')` が正しいスタイル定義を返すこと
- `getStyle('oilpainting')` が正しいスタイル定義を返すこと
- `getStyle('unknown')` が `null` を返すこと（フォールバックなし）
- `isValidStyleId()` がホワイトリスト内のキーでtrueを返すこと
- `isValidStyleId()` が不明なキー・null・undefinedでfalseを返すこと
- 各スタイルのpromptPrefix/negativePrompt/claudeInstructionが空でないこと

#### 6.2 composeImagePromptの拡張テスト

**変更対象:** `tests/character.test.js`

- キャラクターなし + illustrationスタイルのプロンプト合成
- キャラクターなし + oilpaintingスタイルのプロンプト合成
- キャラクターあり + illustrationスタイルのプロンプト合成
- キャラクターあり + oilpaintingスタイルのプロンプト合成
- negativePromptのマージ検証

#### 6.3 create-diary.jsのテスト拡張

**変更対象:** `tests/create-diary-ratelimit.test.js` または新規

- styleIdがClaudeプロンプトに反映されること
- styleIdがimageTokenのHMAC署名に含まれること
- 不正なstyleIdが拒否されること

#### 6.4 generate-image.jsのテスト拡張

**変更対象:** `tests/generate-image.test.js`

- styleIdがHMAC検証に含まれること
- styleIdがプロンプト合成に反映されること
- 不正なstyleIdでの400エラー

#### 6.5 build-image-request.jsのテスト拡張

**変更対象:** `tests/build-image-request.test.js`

- `styleId='illustration'` 時にbodyに `styleId` が含まれること
- `styleId='oilpainting'` 時にbodyに `styleId` が含まれること
- styleIdが常にbodyに設定されること（必須パラメータ）

#### 6.6 image-token.jsのユニットテスト（契約テスト）

**新規ファイル:** `tests/image-token.test.js`

HMAC署名の一貫性を保証する契約テスト:

**正常系:**
- `buildTokenPayload()` が同一パラメータで同一文字列を返すこと
- `generateImageToken()` で生成したトークンが `verifyImageToken()` で検証成功すること（illustration/oilpainting両方）

**改ざん検出:**
- `styleId='illustration'` で署名→`styleId='oilpainting'` で検証→失敗すること
- `characterId` 改ざんで検証失敗すること
- `mode` 改ざんで検証失敗すること

**必須パラメータ検証:**
- `buildTokenPayload()` に `styleId` 未指定で呼び出し→Errorがthrowされること
- `buildTokenPayload()` に `date` 未指定で呼び出し→Errorがthrowされること

**異常系（malformed token）:**
- `verifyImageToken()` にコロンなしの文字列→ `{ valid: false, reason: 'token_format_invalid' }`
- `verifyImageToken()` に非hex文字を含むhmac→ `{ valid: false, reason: 'hmac_format_invalid' }`
- `verifyImageToken()` に64文字未満のhmac→ `{ valid: false, reason: 'hmac_format_invalid' }`
- `verifyImageToken()` に非数値timestamp→ `{ valid: false, reason: 'timestamp_invalid' }`
- `verifyImageToken()` に期限切れtoken→ `{ valid: false, reason: 'token_expired' }`
- `verifyImageToken()` にnull/undefined→ `{ valid: false, reason: 'token_not_string' }`

**この契約テストがcreate-diary ↔ generate-image間のHMAC整合性を構造的に保証する。**

---

## 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `api/lib/image-styles.js` | **新規** | スタイル定義（illustration / oilpainting） |
| `api/lib/image-token.js` | **新規** | HMAC署名生成・検証共通ユーティリティ |
| `api/create-diary.js` | 修正 | styleId受信、Claudeプロンプト強化、HMAC生成をimage-token.jsに委譲 |
| `api/generate-image.js` | 修正 | styleId受信・検証、HMAC検証をimage-token.jsに委譲 |
| `api/lib/character.js` | 修正 | composeImagePrompt()にstyleId引数追加 |
| `docs/diary-input.html` | 修正 | スタイル選択UI追加、create-diary/generate-image両方にstyleId追加 |
| `docs/js/build-image-request.js` | 修正 | styleIdフィールド追加（常に明示的に含める） |
| `tests/image-styles.test.js` | **新規** | スタイル定義テスト |
| `tests/image-token.test.js` | **新規** | HMAC契約テスト（API間署名整合性保証） |
| `tests/character.test.js` | 修正 | スタイル対応のプロンプト合成テスト追加 |
| `tests/generate-image.test.js` | 修正 | styleId関連テスト追加 |
| `tests/build-image-request.test.js` | 修正 | styleIdフィールドテスト追加 |
| `tests/create-diary-dino.test.js` | 修正 | styleId対応のHMAC署名テスト追加 |

---

## セキュリティ考慮事項

1. **HMAC署名にstyleIdを含める**: create-diaryで生成したstyleIdがgenerate-imageで改ざんされないことを保証
2. **styleIdのバリデーション**: `IMAGE_STYLES` のキーのみ許可（ホワイトリスト方式）。未指定・不正値は400エラー
3. **styleId必須契約**: create-diary/generate-image両APIで `styleId` は必須パラメータ。デフォルト補完は行わない（フロントエンドが常に送信する責務）
4. **fail-closed**: 不正なstyleId、不正なトークン形式（malformed token）、HMAC不一致、期限切れは全て明示的にエラーレスポンスを返す。例外を500として漏らさない
5. **verifyImageToken異常系**: トークン形式検証（コロン区切り、hex検証、長さ検証）→ TTL検証 → timingSafeEqual の順で検証。各ステップで失敗時は `{ valid: false, reason }` を返し、呼び出し元が適切なHTTPステータスを返す
6. **既存tokenの互換性**: HMAC署名フォーマット変更により既存の未使用imageTokenは無効化される（5分TTLなので実質影響なし）

## 後方互換性

- `styleId` パラメータは**必須**（create-diary, generate-image両方）。フロントエンドが常に `styleId` を送信するため、APIレベルでの後方互換は不要
- 既存の日記MarkdownにはYAMLに `image_style` フィールドがないが、画像生成時にMarkdownは参照しないため問題なし
- HMAC署名フォーマットの変更により、create-diary後5分以内のimageTokenのみ影響（実質問題なし）
- フロントエンド（diary-input.html）はデフォルトで `illustration` がchecked状態のため、ユーザーが明示的に選択しなくても常に `styleId` が送信される

## NB2（Gemini）固有の考慮事項

- Gemini APIには `style` パラメータがないため、**スタイル制御はプロンプト内テキストで行う**
- `promptPrefix` をプロンプトの先頭に配置することで、Geminiのスタイル解釈を誘導
- `negativePrompt` は `\n\nAvoid: ...` として既存のロジックで付与される
- Geminiの画像生成はDALL-E 3よりプロンプトへのスタイル指示の追従性が高い傾向がある

## 実装順序（推奨）

1. `api/lib/image-styles.js` 新規作成 + テスト
2. `api/lib/image-token.js` 新規作成 + 契約テスト（HMAC署名の共通化）
3. `api/lib/character.js` の `composeImagePrompt()` 改修 + テスト
4. `api/create-diary.js` 改修（Claudeプロンプト強化 + styleId対応 + HMAC生成をimage-token.jsに委譲）+ テスト
5. `api/generate-image.js` 改修（styleId検証 + HMAC検証をimage-token.jsに委譲）+ テスト
6. `docs/js/build-image-request.js` 改修 + テスト
7. `docs/diary-input.html` UI追加（create-diary送信 + generate-image伝搬の両方）
8. 全テスト実行 + codex-review

---

*作成日: 2026-03-20*
*デフォルトバックエンド: NB2（Gemini 3.1 Flash Image Preview）*
