# アイデア2: オリジナルキャラクター日記 - 実装計画

> **作成日**: 2026-03-17
> **最終更新**: 2026-03-17
> **対象**: voice-diary アイデア機能
> **方式**: Vercel Serverless Functions (Node.js ES Modules)
> **関連skill**: vision-to-prompt, art-style-replicator, dino-evo-sim, dino-research
> **キャラクター**: デフォルメ・ケッツァコアトルス

---

## 1. 概要・目的

### 背景
現在のvoice-diaryでは、画像生成APIで日記ごとに独立した画像を生成している。毎回異なるスタイル・キャラクターが生成されるため、SNS投稿の一貫性やブランドアイデンティティが欠けている。

画像生成基盤は **NB2/NBpro（Google Gemini画像生成）** をプライマリとし、**DALL-E 3をフォールバック**として使用する構成に移行済み。

### 目的
- デフォルメされたケッツァコアトルス（翼竜）をオリジナルキャラクターとして確立し、日記の「顔」として活用する
- 恐竜リサーチ（dino-research）の学術的知見に基づいた科学的正確性を保ちつつ、親しみやすいデフォルメデザインを実現する
- NB2/NBpro → DALL-E 3 のフォールバックチェーンでキャラクター画像を生成する
- SNS投稿（Instagram/Bluesky/Threads）でキャラクターを活用した一貫したビジュアルアイデンティティを構築する

### 期待する成果
- ケッツァコアトルスのデフォルメキャラクターによる統一的なSNSブランディング
- 日記の口語→文語変換時にキャラクターの口調・視点を反映
- 恐竜日記システム（Idea-1）との世界観連携

---

## 2. キャラクター設計フレームワーク

### 2.1 キャラクター基本設定（デフォルメ・ケッツァコアトルス）

**学術的根拠**（what-if/dino-research-quetzalcoatlus.md より）:
- **学名**: Quetzalcoatlus northropi Lawson, 1975
- **分類**: Pterosauria > Azhdarchidae
- **特徴**: 翼幅10-11m、頭部高4m以上、無歯の嘴、ピクノファイバー（毛髪様繊維）被覆
- **生態**: 陸上採餌型（コウノトリ・ジサイチョウ型の歩行探索）
- **現代進化予測（dino-evo-sim）**: 翼幅6-7m縮小、嘴幅広化、条件付き協調行動

### 2.2 キャラクタープロファイルスキーマ

```json
{
  "id": "quetz-default",
  "name": "ケッツ",
  "nameEn": "Quetz",
  "species": {
    "scientific": "Quetzalcoatlus northropi",
    "common": "ケッツァコアトルス",
    "family": "Azhdarchidae"
  },
  "personality": {
    "traits": ["好奇心旺盛", "おおらか", "空から見下ろす達観した視点", "少しドジ"],
    "speechStyle": "のんびりした口調、「〜だよ」「〜なんだ」を多用、時々翼竜ジョーク",
    "firstPerson": "ボク",
    "catchphrase": "今日も空から見ると、いい一日だったなぁ〜"
  },
  "appearance": {
    "description": "デフォルメされた小さなケッツァコアトルス。大きな頭と嘴、短い首、ちょこんとした翼。二頭身〜三頭身のかわいらしいプロポーション",
    "descriptionEn": "A chibi/deformed cute Quetzalcoatlus pterosaur. Oversized head with long beak, short neck, stubby wings. 2-3 head proportion ratio, kawaii style",
    "artStyle": "chibi character illustration, soft rounded forms, vibrant warm colors, friendly cartoon style with scientific accuracy in silhouette",
    "colorPalette": ["#E8D5B7", "#8B6914", "#4A90D9", "#F5F5DC"],
    "consistencyKeywords": [
      "chibi quetzalcoatlus",
      "oversized head",
      "long pointed beak",
      "small stubby wings",
      "pycnofiber-covered body",
      "warm brown and cream tones",
      "large expressive eyes",
      "2-3 head proportion"
    ],
    "scientificFeatures": {
      "beak": "長く先端が尖った無歯の嘴（デフォルメでも形状は維持）",
      "crest": "頭頂部の小さな矢状稜（sagittal crest）",
      "covering": "全身を覆う短いピクノファイバー（もふもふ感）",
      "limbs": "四足歩行時の前肢（翼指を折りたたんだ状態）",
      "colorPattern": "背面が暗めの茶色、腹面がクリーム色（カウンターシェーディング）"
    }
  },
  "settings": {
    "origin": "白亜紀後期から現代まで生き延びた翼竜の末裔",
    "occupation": "日記を書くのが趣味の翼竜",
    "background": "空を飛びながら毎日の出来事を観察するのが好き。人間の文化に興味津々",
    "size": "デフォルメサイズ（実際の体長は肩高2-3mだが、キャラクターとしては手のひらサイズ）"
  },
  "imageGeneration": {
    "primaryBackend": "gemini",
    "primaryModel": "nb2",
    "fallbackChain": ["nbpro", "dalle"],
    "basePrompt": "A cute chibi Quetzalcoatlus pterosaur character, 2-3 head proportion, oversized head with long pointed toothless beak, small sagittal crest on top, body covered in soft pycnofibers giving fluffy appearance, stubby folded wings, warm brown and cream countershading coloring, large expressive friendly eyes, kawaii cartoon style with scientifically accurate silhouette",
    "negativePrompt": "photorealistic, dark, horror, violent, scary, dragon, bat wings, teeth, feathers instead of pycnofibers",
    "styleModifiers": ["soft lighting", "warm color palette", "friendly atmosphere", "clean background"],
    "craftAnalysis": {
      "color": "warm earth tones with cream accents, soft contrast",
      "rendering": "clean digital illustration, character design quality",
      "atmosphere": "friendly, approachable, kawaii aesthetic",
      "form": "centered character portrait, clean silhouette",
      "treatment": "highly detailed character design, consistent proportions"
    }
  },
  "snsSettings": {
    "instagramBio": "ケッツの日記 - 翼竜が綴る毎日の記録",
    "blueskyDisplayName": "ケッツの日記",
    "defaultHashtags": ["#ケッツの日記", "#翼竜キャラ", "#AI日記", "#ケッツァコアトルス"]
  },
  "createdAt": "2026-03-17T00:00:00Z",
  "updatedAt": "2026-03-17T00:00:00Z"
}
```

### 2.3 キャラクター設定の保存場所

- **ファイル**: `characters/quetz-default.json`（GitHubリポジトリに保存）
- **理由**: 環境変数ではデータ量が多すぎる。JSONファイルとしてバージョン管理する
- **将来拡張**: 複数キャラクター対応時に `characters/{id}.json` で管理

---

## 3. 技術設計

### 3.1 画像生成パイプライン（NB2/NBpro + DALL-E 3フォールバック）

#### 現在のフロー
```
create-diary.js → image_prompt生成（Claude）
                → generate-image.js → NB2 → [NBpro] → [DALL-E 3]
```

#### 新フロー（キャラクター対応）
```
create-diary.js → image_prompt生成（Claude、キャラクター視点）
                → generate-image.js
                   → キャラクター設定読み込み（GitHub API）
                   → プロンプト合成（image_prompt + キャラクターbasePrompt + CRAFT分析）
                   → NB2（Gemini gemini-3.1-flash-image-preview）
                     → 失敗時: NBpro（Gemini gemini-3-pro-image-preview）
                       → 失敗時: DALL-E 3（フォールバック）
```

#### フォールバックチェーン実装

```javascript
// モデルIDは環境変数で上書き可能（Googleのpreviewモデルは頻繁に変更されるため）
const FALLBACK_CHAIN = [
  { backend: 'gemini', model: process.env.GEMINI_NB2_MODEL || 'gemini-3.1-flash-image-preview', name: 'NB2' },
  { backend: 'gemini', model: process.env.GEMINI_NBPRO_MODEL || 'gemini-3-pro-image-preview', name: 'NBpro' },
  { backend: 'dalle', model: 'dall-e-3', name: 'DALL-E 3' },
];

/**
 * フォールバック付き画像生成
 * @param {string} prompt - 合成済みプロンプト
 * @param {string} negativePrompt - ネガティブプロンプト（Gemini用、DALL-E時は無視）
 * @returns {{ imageData: Buffer, backend: string, model: string }}
 */
async function generateWithFallback(prompt, negativePrompt) {
  for (const target of FALLBACK_CHAIN) {
    try {
      const apiKey = getApiKey(target.backend);
      if (!apiKey) continue; // APIキー未設定ならスキップ

      if (target.backend === 'gemini') {
        return await generateWithGemini(prompt, negativePrompt, target.model, apiKey);
      } else {
        return await generateWithDalle(prompt, apiKey);
      }
    } catch (err) {
      console.warn(`${target.name} failed: ${sanitizeError(err.message, apiKey)}`);
      continue;
    }
  }
  throw new Error('全画像生成バックエンドが失敗しました');
}
```

#### Gemini API呼び出し（Node.js版）

```javascript
import { GoogleGenAI } from '@google/genai';

async function generateWithGemini(prompt, negativePrompt, model, apiKey) {
  const client = new GoogleGenAI({ apiKey });
  // negativePromptがある場合はプロンプトに追記（Gemini APIはnegativePrompt専用パラメータを持たないため）
  const fullPrompt = negativePrompt
    ? `${prompt}\n\nAvoid: ${negativePrompt}`
    : prompt;
  const response = await client.models.generateContent({
    model,
    contents: fullPrompt,
    config: { responseModalities: ['IMAGE'] },
  });

  const parts = response.candidates[0].content.parts;
  for (const part of parts) {
    if (part.inlineData) {
      return {
        imageData: Buffer.from(part.inlineData.data, 'base64'),
        backend: 'gemini',
        model: target.name,   // 表示名: "NB2" or "NBpro"
        modelId: model,       // 実ID: "gemini-3.1-flash-image-preview" 等
      };
    }
  }
  throw new Error('Gemini: 画像データが返されませんでした');
}
```

### 3.2 プロンプト合成ロジック

```javascript
/**
 * キャラクター設定と日記のimage_promptを合成する
 * @param {string} diaryImagePrompt - 日記から生成されたimage_prompt
 * @param {object} character - キャラクター設定オブジェクト
 * @returns {{ prompt: string, negativePrompt: string }}
 */
function composeCharacterPrompt(diaryImagePrompt, character) {
  const { basePrompt, styleModifiers, negativePrompt, craftAnalysis } = character.imageGeneration;
  const { consistencyKeywords } = character.appearance;

  // CRAFT 5軸を活用した合成（what-if/build_image_prompt.pyパターン踏襲）
  const composed = [
    basePrompt,
    `Scene: ${diaryImagePrompt}`,
    `Style: ${styleModifiers.join(', ')}`,
    `Important details: ${consistencyKeywords.join(', ')}`,
    craftAnalysis ? `Color: ${craftAnalysis.color}. Rendering: ${craftAnalysis.rendering}. Atmosphere: ${craftAnalysis.atmosphere}` : '',
  ].filter(Boolean).join('. ');

  return {
    prompt: composed.slice(0, 3800),
    negativePrompt: negativePrompt || '',
  };
}
```

### 3.3 Claudeプロンプト拡張（キャラクター視点の日記整形）

create-diary.jsのClaudeプロンプトにキャラクター設定を注入する。

```
【キャラクター設定（任意）】
キャラクター名: ケッツ（Quetz）
種族: ケッツァコアトルス（翼竜）
性格: {personality.traits}
口調: {personality.speechStyle}
一人称: {personality.firstPerson}

【追加の整形ルール】
7. キャラクターの口調と性格を反映した文体にする（翼竜の視点から人間の日常を観察するユニークな語り口）
8. image_promptにはキャラクターの外見特徴（デフォルメ翼竜）を含める
9. タグにキャラクター関連ハッシュタグを含める
```

### 3.4 キャラクター設定の取得方法

**方式A: GitHub API経由（推奨）**
- generate-image.js / create-diary.js内（サーバーサイド）でGitHub Contents APIから `characters/quetz-default.json` を取得
- 既にGitHub APIアクセスパターンが確立されている（日記ファイル取得と同じ）
- キャッシュ不要（Serverless Functionは毎回起動するため）

**characterIdのバリデーション（パストラバーサル防止）:**
```javascript
// characterIdは英数字・ハイフンのみ、最大30文字
if (characterId && !/^[a-z0-9-]{1,30}$/.test(characterId)) {
  return res.status(400).json({ error: 'キャラクターIDの形式が不正です。' });
}
// ディレクトリトラバーサル防止
if (characterId && (characterId.includes('..') || characterId.includes('/'))) {
  return res.status(400).json({ error: 'キャラクターIDの形式が不正です。' });
}
```

### 3.5 APIキー管理

画像生成に必要なAPIキーはVercel環境変数（.env）で管理する。

| 環境変数 | 用途 | バックエンド |
|----------|------|------------|
| `GOOGLE_API_KEY` | Gemini NB2/NBpro画像生成 | プライマリ |
| `OPENAI_API_KEY` | DALL-E 3画像生成 | フォールバック |

**エラーサニタイズ・ログポリシー**:
- APIキーがエラーメッセージに含まれないよう、what-ifプロジェクトと同様の`sanitizeError()`パターンを適用する
- **ログ出力ルール**: `console.error(err)` で生エラーオブジェクトを出力しない。必ず `console.error(sanitizeError(err.message, apiKey))` で許可フィールドのみ出力する
- プロバイダエラーJSON全体のログ出力を禁止し、`err.message` と `err.status` のみ記録する

```javascript
function sanitizeError(message, ...keys) {
  let sanitized = message;
  for (const key of keys) {
    if (key && sanitized.includes(key)) {
      sanitized = sanitized.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
    }
  }
  return sanitized;
}
```

---

## 4. 実装フェーズ

### Phase A: キャラクター基盤 + 画像生成フォールバック（MVP）
1. キャラクタープロファイルスキーマ定義
2. `characters/quetz-default.json` 作成（デフォルメ・ケッツァコアトルス）
3. `api/lib/character.js` 共通ライブラリ作成（キャラクター読み込み + プロンプト合成）
4. `api/lib/image-backend.js` 画像生成バックエンド共通ライブラリ（NB2/NBpro/DALL-E 3フォールバックチェーン）
5. `api/generate-image.js` 拡張（キャラクタープロンプト合成 + フォールバックチェーン統合）
6. テスト追加
7. `@google/genai` パッケージ追加（package.json）

### Phase B: 日記整形へのキャラクター反映
1. `api/create-diary.js` 拡張（Claudeプロンプトにキャラクター設定注入）
2. 日記Markdownにキャラクター情報をfrontmatterに追加（`character: quetz-default`）
3. テスト追加

### Phase C: フロントエンドUI
1. `docs/diary-input.html` にキャラクター選択/プレビューUI追加
2. キャラクター設定確認画面（現在のキャラクター表示）
3. キャラクター有効/無効の切り替え

### Phase D: SNS連携強化
1. SNS投稿テキストにキャラクター口調を反映
2. キャラクター専用ハッシュタグの自動付与
3. 投稿テンプレートのキャラクター対応

### Phase E: キャラクター管理API（将来）
1. `api/character.js` - キャラクターCRUD API
2. キャラクター作成/編集UI
3. 複数キャラクター切り替え対応

---

## 5. API設計

### 5.1 既存API拡張

#### `api/generate-image.js` の変更点

**追加パラメータ（リクエストボディ）:**
```json
{
  "date": "2026-03-17",
  "imageToken": "timestamp:hmac",
  "characterId": "quetz-default"
}
```

**処理フロー変更:**
```
// 7.5 キャラクター設定読み込み（任意）
//   - characterId が指定されている場合:
//     GET characters/{characterId}.json from GitHub
//     プロンプト合成: composeCharacterPrompt(imagePrompt, character)
//   - characterId が未指定 or ファイル不存在:
//     従来どおり imagePrompt をそのまま使用（後方互換）
//
// 8. 画像生成（フォールバックチェーン）
//   - NB2 (gemini-3.1-flash-image-preview) で生成試行
//   - 失敗時: NBpro (gemini-3-pro-image-preview) にフォールバック
//   - 失敗時: DALL-E 3 にフォールバック
//   - 全失敗時: 500エラー
```

**レスポンス拡張:**
```json
{
  "success": true,
  "imageUrl": "...",
  "backend": "gemini",
  "model": "NB2",
  "modelId": "gemini-3.1-flash-image-preview",
  "characterId": "quetz-default"
}
```

#### `api/create-diary.js` の変更点

**追加パラメータ（リクエストボディ）:**
```json
{
  "rawText": "今日の出来事...",
  "characterId": "quetz-default"
}
```

**レスポンス拡張:**
```json
{
  "success": true,
  "title": "...",
  "tags": ["..."],
  "filePath": "...",
  "githubUrl": "...",
  "date": "2026-03-17",
  "imageToken": "...",
  "characterId": "quetz-default"
}
```

### 5.2 新規API（Phase E）

#### `api/character.js` - キャラクター管理API

**GET /api/character?id=quetz-default**
- キャラクター情報取得
- JWT認証
- GitHub APIからJSONファイル読み込み

Phase A-CではPhase E（キャラクター管理API）のGETのみ先行実装する（フロントエンドプレビュー用）。

### 5.3 新規共通ライブラリ

#### `api/lib/character.js`

```javascript
export async function loadCharacter(characterId, githubConfig) { ... }
export function composeImagePrompt(diaryImagePrompt, character) { ... }
export function injectCharacterPrompt(basePrompt, character) { ... }
```

#### `api/lib/image-backend.js`（新規）

```javascript
/**
 * フォールバックチェーン付き画像生成
 * @param {string} prompt - 画像生成プロンプト
 * @param {string} negativePrompt - ネガティブプロンプト（Gemini用）
 * @returns {{ imageData: Buffer, backend: string, model: string, modelId: string }}
 * - model: 表示名（"NB2", "NBpro", "DALL-E 3"）
 * - modelId: 実モデルID（"gemini-3.1-flash-image-preview" 等）
 */
export async function generateImageWithFallback(prompt, negativePrompt) { ... }

/**
 * Gemini API経由の画像生成
 * @param {string} prompt - 画像生成プロンプト
 * @param {string} negativePrompt - ネガティブプロンプト
 * @param {string} model - モデルID
 * @param {string} apiKey - Google API Key
 * @returns {{ imageData: Buffer, backend: string, model: string, modelId: string }}
 */
async function generateWithGemini(prompt, negativePrompt, model, apiKey) { ... }

/**
 * DALL-E 3経由の画像生成
 */
async function generateWithDalle(prompt, apiKey) { ... }

/**
 * エラーメッセージからAPIキーを除去する
 */
export function sanitizeError(message, ...keys) { ... }
```

---

## 6. フロントエンド変更

### 6.1 diary-input.html 変更点

#### キャラクター選択セクション（入力フォーム上部に追加）

```html
<div class="character-section">
  <h3>キャラクター設定</h3>
  <div class="character-toggle">
    <label>
      <input type="checkbox" id="use-character" checked>
      キャラクターを使用する
    </label>
  </div>
  <div id="character-preview" class="character-preview">
    <div class="character-info">
      <span class="character-name">読み込み中...</span>
      <span class="character-style">画風: ---</span>
    </div>
  </div>
</div>
```

#### JavaScript追加
- ページ読み込み時に **サーバーAPI経由** でキャラクター設定を取得してプレビュー表示
  - `GET /api/character?id=quetz-default` で取得
  - フロントエンドから直接GitHub APIは呼ばない（GITHUB_TOKENをクライアントに露出させない）
- チェックボックスでキャラクター有効/無効を切り替え
- create-diary / generate-image 呼び出し時に `characterId` パラメータを付与

---

## 7. SNS連携

### 7.1 Instagram投稿フォーマット

```
ケッツの日記

{title}

{summary}

{tags} #ケッツの日記 #翼竜キャラ #AI日記

#ケッツァコアトルス #VoiceDiary
```

### 7.2 Bluesky投稿フォーマット（300 graphemes制限）

```
今日も空から見ると、いい一日だったなぁ〜
{title}
{tags（収まる範囲で）}
```

### 7.3 Threads投稿フォーマット（500文字制限）

```
ケッツの日記
{title}
{tags}
```

### 7.4 実装方式
- SNS投稿APIは変更しない（フロントエンドでキャプション/テキストを生成して送信する現在の方式を維持）
- diary-input.html のキャプション自動生成ロジックにキャラクター情報を注入
- ユーザーは投稿前にキャプションを編集可能（既存の動作と同じ）

---

## 8. テスト計画

### 8.1 新規テストファイル

#### `tests/character.test.js`（約18テスト）

```
describe('loadCharacter')
  - デフォルトキャラクター（quetz-default）読み込み成功
  - 存在しないキャラクターIDでnull返却
  - GitHub API失敗時にnull返却（fail-open: キャラクターなしで続行）
  - JSON解析失敗時にnull返却
  - キャラクタースキーマ検証（必須フィールド確認）
  - パストラバーサル攻撃（"../secret"等）でnull返却（バリデーションはhandler側で400）
  - 過長characterId（31文字以上）でnull返却
  - 不正文字含むcharacterId（"default/../../"等）でnull返却

注: characterIdのバリデーション（400レスポンス）はHTTPハンドラ（generate-image.js / create-diary.js）で実施。
loadCharacter()はlib関数のため不正IDにはnullを返す（handlerがバリデーション済みで呼ぶ前提）。

describe('composeImagePrompt')
  - キャラクター設定 + image_promptの合成
  - キャラクターがnullの場合はimage_promptをそのまま返却
  - 合成結果が3800文字以内に収まること
  - basePrompt + consistencyKeywordsの含有確認
  - CRAFT分析フィールドが合成に含まれること
  - negativePromptが返却されること

describe('injectCharacterPrompt')
  - キャラクター設定がClaudeプロンプトに注入されること
  - キャラクターがnullの場合は元のプロンプトを返却
  - personality.speechStyleが含まれること
  - species.commonが含まれること
```

#### `tests/image-backend.test.js`（約12テスト）

```
describe('generateImageWithFallback')
  - NB2成功時にNB2の結果を返す
  - NB2失敗→NBpro成功時にNBproの結果を返す
  - NB2/NBpro失敗→DALL-E 3成功時にDALL-E 3の結果を返す
  - 全バックエンド失敗時にエラーをthrow
  - GOOGLE_API_KEY未設定時にGeminiをスキップ
  - OPENAI_API_KEY未設定時にDALL-E 3をスキップ

describe('generateWithGemini')
  - 正常レスポンスから画像データ抽出
  - レスポンスに画像なしでエラーthrow
  - API障害時にエラーthrow

describe('sanitizeError')
  - APIキーがエラーメッセージから除去される
  - キーがない場合はメッセージをそのまま返す
  - 複数キーの除去
```

### 8.2 既存テスト拡張

#### `tests/generate-image.test.js` 追加ケース（約5テスト）
```
describe('キャラクター画像生成')
  - characterId指定時にキャラクタープロンプトが合成されること
  - characterId未指定時に従来動作（後方互換）
  - キャラクターファイル不存在時にフォールバック（image_promptそのまま）
  - レスポンスにbackend/modelが含まれること
  - キャラクター取得失敗時にcreate-diary/generate-image双方が正常動作すること
```

#### `tests/create-diary-ratelimit.test.js` 追加ケース（約3テスト）
```
describe('キャラクター日記整形')
  - characterId指定時にClaudeプロンプトにキャラクター設定が含まれること
  - characterId未指定時に従来のプロンプト（後方互換）
  - レスポンスにcharacterIdが含まれること
```

#### `tests/character-api.test.js` 追加ケース（約6テスト、Phase C先行実装分）
```
describe('GET /api/character')
  - 有効なJWTでキャラクター情報取得成功
  - 無効なJWTで401
  - CORS検証
  - 存在しないidで404
  - id未指定でデフォルト返却
  - GitHub API障害時500
```

### 8.3 テスト数見積もり
- 現在: 168テスト
- 新規追加: 約44テスト（character: 18 + image-backend: 12 + generate-image: 5 + create-diary: 3 + character-api: 6）
- 合計: 約212テスト

---

## 9. リスクと依存関係

### 9.1 リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| NB2/NBproのキャラクター一貫性問題 | 毎回微妙に異なるキャラクターが生成される | consistencyKeywordsとCRAFT分析で一貫性を強化。3段階フォールバックで品質を担保 |
| Gemini APIの画像生成品質のばらつき | NB2は高速だが品質が不安定な場合がある | NBpro→DALL-E 3フォールバックで品質を保証 |
| `@google/genai` パッケージ追加 | 本番依存が増える（sharp + @google/genai） | sharpと同様、Vercel Serverlessで動作確認済みのパッケージを使用 |
| APIキー漏洩リスク | GOOGLE_API_KEY/OPENAI_API_KEYの露出 | sanitizeError()でログ/エラーからキーを除去。Vercel環境変数で管理 |
| 後方互換性の破壊 | 既存の日記・画像生成が動かなくなる | characterIdは任意パラメータ。未指定時は従来動作を完全に維持 |
| デフォルメと学術的正確性の両立 | 可愛さを追求すると科学的特徴が失われる | 「シルエットの正確性」を維持しつつデフォルメ（嘴形状・四肢構造・ピクノファイバー） |

### 9.2 依存関係

| 依存 | 種類 | 状態 |
|------|------|------|
| Google Gemini API (NB2/NBpro) | 外部サービス | 新規追加（プライマリ） |
| DALL-E 3 API | 外部サービス | 利用中（フォールバック） |
| `@google/genai` NPMパッケージ | NPM依存 | 新規追加 |
| Claude API | 外部サービス | 利用中（既存） |
| GitHub Contents API | 外部サービス | 利用中（既存） |
| dino-research (Quetzalcoatlus) | 学術データ | what-if/dino-research-quetzalcoatlus.md |
| dino-evo-sim | 進化予測データ | what-if/output/quetzalcoatlus_evolution_data.json |

### 9.3 新規環境変数

| 変数名 | 用途 | 備考 |
|--------|------|------|
| `GOOGLE_API_KEY` | Gemini NB2/NBpro画像生成 | .envで管理、Vercel環境変数に設定 |
| `GEMINI_NB2_MODEL` | NB2モデルID上書き（任意） | デフォルト: gemini-3.1-flash-image-preview |
| `GEMINI_NBPRO_MODEL` | NBproモデルID上書き（任意） | デフォルト: gemini-3-pro-image-preview |

※ `OPENAI_API_KEY` は既存（DALL-E 3用として設定済み）
※ モデルIDはGoogleのpreviewモデル変更に追従するため環境変数で上書き可能にする

---

## 10. 見積もり

| フェーズ | 内容 | 規模 |
|---------|------|------|
| Phase A | キャラクター基盤 + NB2/NBproフォールバック | 6時間 |
| Phase B | 日記整形へのキャラクター反映 | 1.5時間 |
| Phase C | フロントエンドUI | 2時間 |
| Phase D | SNS連携強化 | 1時間 |
| Phase E | キャラクター管理API（将来） | 9時間 |
| **Phase A-D（推奨スコープ）** | | **約10.5時間** |
| **全体** | | **約19.5時間** |

---

## 実装順序

```
Phase A（MVP）:
1. characters/quetz-default.json 作成（デフォルメ・ケッツァコアトルス）
2. api/lib/character.js 実装（共通ライブラリ）
3. api/lib/image-backend.js 実装（NB2/NBpro/DALL-E 3フォールバック）
4. tests/character.test.js 作成（テスト先行）
5. tests/image-backend.test.js 作成（テスト先行）
6. api/generate-image.js 拡張（キャラクタープロンプト合成 + フォールバック統合）
7. tests/generate-image.test.js 追加ケース
8. package.json に @google/genai 追加
9. npm test → 全テスト通過確認

Phase B:
10. api/create-diary.js 拡張（Claudeプロンプトにキャラクター注入）
11. tests/create-diary-ratelimit.test.js 追加ケース
12. npm test → 全テスト通過確認

Phase C:
13. docs/diary-input.html キャラクター選択UI追加
14. api/character.js GET実装（フロントエンドプレビュー用）

Phase D:
15. diary-input.html SNSキャプション自動生成にキャラクター情報反映

共通:
16. CLAUDE.md 更新
17. codex-review 実施（ok: trueまで）
18. コミット → デプロイ
19. 本番検証（ケッツァコアトルスキャラクター画像生成 → SNS投稿）
```

---

## ディレクトリ構造変更

```
voice-diary/
├── characters/                  # 新規追加
│   └── quetz-default.json       # デフォルメ・ケッツァコアトルス設定
├── api/
│   ├── lib/
│   │   ├── cors.js
│   │   ├── jwt.js
│   │   ├── character.js         # 新規追加: キャラクター共通ライブラリ
│   │   └── image-backend.js     # 新規追加: NB2/NBpro/DALL-E 3フォールバック
│   ├── create-diary.js          # 変更: キャラクター設定注入
│   ├── generate-image.js        # 変更: プロンプト合成 + フォールバック統合
│   ├── character.js             # 新規追加（Phase E、GET先行実装）
│   └── ...
├── tests/
│   ├── character.test.js        # 新規追加
│   ├── image-backend.test.js    # 新規追加
│   └── ...
└── docs/
    └── diary-input.html         # 変更: キャラクター選択UI
```

---

## 完了基準

- [ ] characters/quetz-default.json 作成済み（デフォルメ・ケッツァコアトルス）
- [ ] api/lib/character.js 実装・テスト通過
- [ ] api/lib/image-backend.js 実装・テスト通過（NB2/NBpro/DALL-E 3フォールバック）
- [ ] api/generate-image.js キャラクタープロンプト合成 + フォールバック対応
- [ ] api/create-diary.js キャラクター設定注入対応
- [ ] docs/diary-input.html キャラクター選択UI追加
- [ ] SNS投稿キャプションにキャラクター情報反映
- [ ] 全テスト通過（npm test、約212テスト）
- [ ] 後方互換性確認（characterId未指定時に従来動作）
- [ ] GOOGLE_API_KEY環境変数設定済み
- [ ] codex-review ok: true
- [ ] Vercelデプロイ成功
- [ ] 本番でケッツァコアトルスキャラクター画像生成成功
