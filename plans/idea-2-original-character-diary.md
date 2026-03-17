# アイデア2: オリジナルキャラクター日記 - 実装計画

> **作成日**: 2026-03-17
> **対象**: voice-diary アイデア機能
> **方式**: Vercel Serverless Functions (Node.js ES Modules)
> **関連skill**: vision-to-prompt, art-style-replicator

---

## 1. 概要・目的

### 背景
現在のvoice-diaryでは、DALL-E 3で日記ごとに独立した画像を生成している。毎回異なるスタイル・キャラクターが生成されるため、SNS投稿の一貫性やブランドアイデンティティが欠けている。

### 目的
- 自分だけのオリジナルキャラクター（OC）を作成し、日記の「顔」として活用する
- キャラクターのデザイン（画風・性格・設定）を確立し、画像生成で一貫性を保つ
- 日々の気づきをキャラクターの視点や表現で投稿し、SNSでの独自性を高める
- DALL-E 3のプロンプトにキャラクター設定を注入し、統一感のある画像を生成する

### 期待する成果
- SNS投稿（Instagram/Bluesky/Threads）でキャラクターを活用した一貫したビジュアルアイデンティティ
- 日記の口語→文語変換時にキャラクターの口調・視点を反映
- フォロワーがキャラクターを認識しやすくなり、エンゲージメント向上

---

## 2. キャラクター設計フレームワーク

### 2.1 キャラクタープロファイルスキーマ

```json
{
  "id": "char_001",
  "name": "キャラクター名",
  "nameEn": "Character Name (English)",
  "personality": {
    "traits": ["好奇心旺盛", "少しおっちょこちょい", "優しい"],
    "speechStyle": "ですます調で少しカジュアル、感嘆符を多用",
    "firstPerson": "わたし",
    "catchphrase": "今日もいい日だったなぁ！"
  },
  "appearance": {
    "description": "ショートヘアの女の子、大きな丸い目、いつもベレー帽をかぶっている",
    "descriptionEn": "A girl with short hair, large round eyes, always wearing a beret",
    "artStyle": "soft watercolor illustration style, warm pastel colors, Studio Ghibli-inspired",
    "colorPalette": ["#FFB6C1", "#87CEEB", "#F5DEB3", "#98FB98"],
    "consistencyKeywords": ["beret", "short hair", "round eyes", "warm smile"]
  },
  "settings": {
    "age": "20代",
    "occupation": "日記を書くのが趣味の女の子",
    "background": "毎日の小さな幸せを見つけるのが得意"
  },
  "imageGeneration": {
    "basePrompt": "soft watercolor illustration of a cheerful girl with short hair wearing a beret, large round eyes, warm pastel colors, Studio Ghibli-inspired art style",
    "negativeKeywords": ["photorealistic", "dark", "horror", "violent"],
    "styleModifiers": ["gentle lighting", "cozy atmosphere", "warm tones"]
  },
  "snsSettings": {
    "instagramBio": "毎日を彩るオリジナルキャラクター日記",
    "blueskyDisplayName": "キャラクター名の日記",
    "defaultHashtags": ["#オリジナルキャラクター", "#AI日記", "#イラスト日記"]
  },
  "createdAt": "2026-03-17T00:00:00Z",
  "updatedAt": "2026-03-17T00:00:00Z"
}
```

### 2.2 キャラクター設定の保存場所

- **ファイル**: `characters/default.json`（GitHubリポジトリに保存）
- **理由**: 環境変数ではデータ量が多すぎる。JSONファイルとしてバージョン管理する
- **将来拡張**: 複数キャラクター対応時に `characters/{id}.json` で管理

---

## 3. 技術設計

### 3.1 画像生成パイプライン拡張

#### 現在のフロー
```
create-diary.js → image_prompt生成（Claude）
                → generate-image.js → DALL-E 3（image_promptをそのまま使用）
```

#### 新フロー
```
create-diary.js → image_prompt生成（Claude）
                → generate-image.js
                   → キャラクター設定読み込み（GitHub API or キャッシュ）
                   → プロンプト合成（image_prompt + キャラクターbasePrompt + styleModifiers）
                   → DALL-E 3（合成プロンプトで生成）
```

### 3.2 プロンプト合成ロジック

```javascript
/**
 * キャラクター設定と日記のimage_promptを合成する
 * @param {string} diaryImagePrompt - 日記から生成されたimage_prompt
 * @param {object} character - キャラクター設定オブジェクト
 * @returns {string} 合成されたDALL-E用プロンプト
 */
function composeCharacterPrompt(diaryImagePrompt, character) {
  const { basePrompt, styleModifiers, negativeKeywords } = character.imageGeneration;
  const { consistencyKeywords } = character.appearance;

  // 合成パターン: キャラクター基本 + シーン描写 + スタイル修飾
  const composed = [
    basePrompt,
    `Scene: ${diaryImagePrompt}`,
    `Style: ${styleModifiers.join(', ')}`,
    `Important details: ${consistencyKeywords.join(', ')}`
  ].join('. ');

  // DALL-E 3のプロンプト上限（4000文字）を考慮して切り詰め
  return composed.slice(0, 3800);
}
```

### 3.3 Claudeプロンプト拡張（キャラクター視点の日記整形）

create-diary.jsのClaudeプロンプトにキャラクター設定を注入する。

```
【キャラクター設定（任意）】
キャラクター名: {name}
性格: {personality.traits}
口調: {personality.speechStyle}
一人称: {personality.firstPerson}

【追加の整形ルール】
7. キャラクターの口調と性格を反映した文体にする
8. image_promptにはキャラクターの外見特徴を含める
```

### 3.4 キャラクター設定の取得方法

**方式A: GitHub API経由（推奨）**
- generate-image.js / create-diary.js内（サーバーサイド）でGitHub Contents APIから `characters/default.json` を取得
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

**方式B: 環境変数（却下）**
- キャラクター設定は構造が複雑でデータ量が多い
- Vercel環境変数のサイズ制限に抵触する可能性

**方式C: Upstash Redis（将来検討）**
- 複数キャラクター切り替え時にRedisに格納
- 現時点ではオーバーエンジニアリング

---

## 4. 実装フェーズ

### Phase A: キャラクター基盤（MVP）
1. キャラクタープロファイルスキーマ定義
2. `characters/default.json` 作成（デフォルトキャラクター）
3. `api/lib/character.js` 共通ライブラリ作成（キャラクター読み込み + プロンプト合成）
4. `api/generate-image.js` 拡張（キャラクタープロンプト合成）
5. テスト追加

### Phase B: 日記整形へのキャラクター反映
1. `api/create-diary.js` 拡張（Claudeプロンプトにキャラクター設定注入）
2. 日記Markdownにキャラクター情報をfrontmatterに追加（`character: char_001`）
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
  "characterId": "default"
}
```

**処理フロー変更（セクション7.5として追加）:**
```
// 7.5 キャラクター設定読み込み（任意）
//   - characterId が指定されている場合:
//     GET characters/{characterId}.json from GitHub
//     プロンプト合成: composeCharacterPrompt(imagePrompt, character)
//   - characterId が未指定 or ファイル不存在:
//     従来どおり imagePrompt をそのまま使用（後方互換）
```

#### `api/create-diary.js` の変更点

**追加パラメータ（リクエストボディ）:**
```json
{
  "rawText": "今日の出来事...",
  "characterId": "default"
}
```

**Claudeプロンプト拡張:**
- characterIdが指定されている場合、キャラクター設定をプロンプトに注入
- 未指定の場合は従来の動作を維持（後方互換）

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
  "characterId": "default"
}
```

### 5.2 新規API（Phase E）

#### `api/character.js` - キャラクター管理API

**GET /api/character?id=default**
- キャラクター情報取得
- JWT認証
- GitHub APIからJSONファイル読み込み

**PUT /api/character**
- キャラクター更新
- JWT認証
- GitHub APIでJSONファイル更新

現時点（Phase A-D）ではAPIは不要。`characters/default.json` を直接Git管理する。

### 5.3 新規共通ライブラリ

#### `api/lib/character.js`

```javascript
/**
 * GitHubからキャラクター設定を取得する
 * @param {string} characterId - キャラクターID（デフォルト: 'default'）
 * @param {object} githubConfig - { token, owner, repo }
 * @returns {object|null} キャラクター設定オブジェクト、未存在時はnull
 */
export async function loadCharacter(characterId, githubConfig) { ... }

/**
 * キャラクター設定と日記のimage_promptを合成する
 * @param {string} diaryImagePrompt - 日記から生成されたimage_prompt
 * @param {object} character - キャラクター設定オブジェクト
 * @returns {string} 合成されたDALL-E用プロンプト
 */
export function composeImagePrompt(diaryImagePrompt, character) { ... }

/**
 * Claudeプロンプトにキャラクター設定を注入する
 * @param {string} basePrompt - 基本のClaudeプロンプト
 * @param {object} character - キャラクター設定オブジェクト
 * @returns {string} キャラクター設定が注入されたプロンプト
 */
export function injectCharacterPrompt(basePrompt, character) { ... }
```

---

## 6. フロントエンド変更

### 6.1 diary-input.html 変更点

#### キャラクター選択セクション（入力フォーム上部に追加）

```html
<!-- キャラクター設定セクション -->
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
  - `GET /api/character?id=default` で取得（GitHub APIトークンはサーバーサイドのみ保持）
  - フロントエンドから直接GitHub APIは呼ばない（GITHUB_TOKENをクライアントに露出させない）
  - Phase A-CではPhase E（キャラクター管理API）を先行して最小限実装する（GETのみ）
- チェックボックスでキャラクター有効/無効を切り替え
- create-diary / generate-image 呼び出し時に `characterId` パラメータを付与

### 6.2 index.html 変更点（将来）
- 日記一覧でキャラクター情報を表示（frontmatterから取得）
- キャラクターアイコンの表示

---

## 7. SNS連携

### 7.1 Instagram投稿フォーマット

キャラクター有効時のキャプション自動生成:
```
{character.name}の日記

{title}

{summary}

{tags} {character.snsSettings.defaultHashtags}

#AI日記 #オリジナルキャラクター #VoiceDiary
```

### 7.2 Bluesky投稿フォーマット

300 graphemes制限を考慮:
```
{character.catchphrase}
{title}
{tags（収まる範囲で）}
```

### 7.3 Threads投稿フォーマット

500文字制限を考慮:
```
{character.name}の日記
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

#### `tests/character.test.js`（約15テスト）

```
describe('loadCharacter')
  - デフォルトキャラクター読み込み成功
  - 存在しないキャラクターIDでnull返却
  - GitHub API失敗時にnull返却（fail-open: キャラクターなしで続行）
  - JSON解析失敗時にnull返却
  - キャラクタースキーマ検証（必須フィールド確認）
  - パストラバーサル攻撃（"../secret"等）で400エラー
  - 過長characterId（31文字以上）で400エラー
  - 不正文字含むcharacterId（"default/../../"等）で400エラー

describe('composeImagePrompt')
  - キャラクター設定 + image_promptの合成
  - キャラクターがnullの場合はimage_promptをそのまま返却
  - 合成結果が3800文字以内に収まること
  - basePrompt + styleModifiers + consistencyKeywordsの含有確認

describe('injectCharacterPrompt')
  - キャラクター設定がClaudeプロンプトに注入されること
  - キャラクターがnullの場合は元のプロンプトを返却
  - personality.speechStyleが含まれること
  - personality.firstPersonが含まれること
```

### 8.2 既存テスト拡張

#### `tests/generate-image.test.js` 追加ケース（約5テスト）
```
describe('キャラクター画像生成')
  - characterId指定時にキャラクタープロンプトが合成されること
  - characterId未指定時に従来動作（後方互換）
  - キャラクターファイル不存在時にフォールバック（image_promptそのまま）
  - 合成プロンプトがDALL-E APIに渡されること
  - キャラクター取得失敗時にcreate-diary/generate-image双方が正常動作すること
```

#### `tests/create-diary-ratelimit.test.js` 追加ケース（約3テスト）
```
describe('キャラクター日記整形')
  - characterId指定時にClaudeプロンプトにキャラクター設定が含まれること
  - characterId未指定時に従来のプロンプト（後方互換）
  - レスポンスにcharacterIdが含まれること
```

### 8.3 テスト数見積もり
- 現在: 168テスト
- 新規追加: 約23テスト（character: 15 + generate-image: 5 + create-diary: 3）
- 合計: 約191テスト

---

## 9. リスクと依存関係

### 9.1 リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| DALL-E 3のキャラクター一貫性問題 | 毎回微妙に異なるキャラクターが生成される | プロンプトにconsistencyKeywordsを詳細に記述。将来的にはキャラクターリファレンス画像機能（DALL-E API拡張待ち）を検討 |
| プロンプト長の増大 | DALL-E 3の4000文字制限に近づく | composeImagePromptで3800文字に切り詰め |
| GitHub API呼び出し増加 | レイテンシ増加（キャラクターJSON取得追加） | fail-open設計: キャラクター取得失敗時は従来動作にフォールバック |
| 後方互換性の破壊 | 既存の日記・画像生成が動かなくなる | characterIdは任意パラメータ。未指定時は従来動作を完全に維持 |
| Claude APIプロンプト変更による出力品質低下 | 日記整形結果の品質が変わる可能性 | A/Bテストでキャラクター有り/無しの出力を比較検証 |

### 9.2 依存関係

| 依存 | 種類 | 状態 |
|------|------|------|
| DALL-E 3 API | 外部サービス | 利用中（既存） |
| Claude API | 外部サービス | 利用中（既存） |
| GitHub Contents API | 外部サービス | 利用中（既存） |
| キャラクターリファレンス画像（DALL-E） | 将来機能 | 未提供（OpenAI側） |
| vision-to-prompt skill | 関連ツール | キャラクターデザイン時の参考に使用 |
| art-style-replicator skill | 関連ツール | 画風の一貫性確保に使用 |

### 9.3 制約事項
- DALL-E 3はテキストプロンプトのみでキャラクターの一貫性を保つのが困難。プロンプトエンジニアリングで最大限対応するが、完全な一貫性は期待できない
- 将来的にOpenAIがキャラクターリファレンス画像機能をDALL-E APIに追加した場合、大幅な改善が見込める

---

## 10. 見積もり

| フェーズ | 内容 | 規模 |
|---------|------|------|
| Phase A | キャラクター基盤（MVP） | 4.5時間 |
| Phase B | 日記整形へのキャラクター反映 | 1.5時間 |
| Phase C | フロントエンドUI | 2時間 |
| Phase D | SNS連携強化 | 1時間 |
| Phase E | キャラクター管理API（将来） | 9時間 |
| **Phase A-D（推奨スコープ）** | | **約9時間** |
| **全体** | | **約18時間** |

---

## 実装順序

```
Phase A（MVP）:
1. characters/default.json 作成（キャラクタープロファイル定義）
2. api/lib/character.js 実装（共通ライブラリ）
3. tests/character.test.js 作成（テスト先行）
4. api/generate-image.js 拡張（プロンプト合成統合）
5. tests/generate-image.test.js 追加ケース
6. npm test → 全テスト通過確認

Phase B:
7. api/create-diary.js 拡張（Claudeプロンプトにキャラクター注入）
8. tests/create-diary-ratelimit.test.js 追加ケース
9. npm test → 全テスト通過確認

Phase C:
10. docs/diary-input.html キャラクター選択UI追加

Phase D:
11. diary-input.html SNSキャプション自動生成にキャラクター情報反映

共通:
12. CLAUDE.md 更新
13. codex-review 実施（ok: trueまで）
14. コミット → デプロイ
15. 本番検証（キャラクター画像生成 → SNS投稿）
```

---

## ディレクトリ構造変更

```
voice-diary/
├── characters/                  # 新規追加
│   └── default.json             # デフォルトキャラクター設定
├── api/
│   ├── lib/
│   │   ├── cors.js
│   │   ├── jwt.js
│   │   └── character.js         # 新規追加: キャラクター共通ライブラリ
│   ├── create-diary.js          # 変更: キャラクター設定注入
│   ├── generate-image.js        # 変更: プロンプト合成
│   └── ...
├── tests/
│   ├── character.test.js        # 新規追加
│   └── ...
└── docs/
    └── diary-input.html         # 変更: キャラクター選択UI
```

---

## 完了基準

- [ ] characters/default.json 作成済み
- [ ] api/lib/character.js 実装・テスト通過
- [ ] api/generate-image.js キャラクタープロンプト合成対応
- [ ] api/create-diary.js キャラクター設定注入対応
- [ ] docs/diary-input.html キャラクター選択UI追加
- [ ] SNS投稿キャプションにキャラクター情報反映
- [ ] 全テスト通過（npm test、約191テスト）
- [ ] 後方互換性確認（characterId未指定時に従来動作）
- [ ] codex-review ok: true
- [ ] Vercelデプロイ成功
- [ ] 本番でキャラクター画像生成成功
