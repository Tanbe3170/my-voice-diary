# Plan 2 Phase B/C/D: キャラクター日記システム完成

## 概要

Plan 2 Phase A（generate-image.jsへのキャラクター統合）完了を受け、残りのPhase B/C/Dを実装する。

## 前提条件

- Phase A完了: generate-image.js にキャラクター統合済み（commit ee2d295）
- api/lib/character.js 実装済み（loadCharacter, composeImagePrompt, injectCharacterPrompt）
- characters/quetz-default.json 作成済み
- 全300テスト通過

---

## Phase B: create-diary.js にキャラクター設定注入

### 目的
日記の文体・口調をキャラクター設定に基づいて変換する。

### 変更ファイル
- `api/create-diary.js`
- `tests/create-diary-character.test.js`（新規 - キャラクター統合テスト）

### 実装内容

#### 1. import追加
```javascript
import { loadCharacter, injectCharacterPrompt } from './lib/character.js';
```

#### 2. requestBodyにcharacterIdパラメータ追加
```javascript
const { rawText, mode, dinoContext, characterId } = req.body;
```

#### 3. characterIdバリデーション（任意パラメータ）
```javascript
if (characterId !== undefined) {
  if (typeof characterId !== 'string' || !/^[a-z0-9-]{1,30}$/.test(characterId)) {
    return res.status(400).json({ error: 'キャラクターIDの形式が不正です。' });
  }
}
```

#### 4. キャラクター読み込み（Claude API呼び出し前）
```javascript
let character = null;
let appliedCharacterId = null; // 実際にloadに成功したIDのみ記録
if (characterId) {
  try {
    character = await loadCharacter(characterId, {
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
    });
    if (character) {
      appliedCharacterId = characterId;
    }
  } catch (err) {
    console.warn('キャラクター読み込み失敗（フォールバック）:', err.message);
    // fail-open: キャラクター読み込み失敗時は通常モードで継続
    // appliedCharacterId = null → frontmatter/レスポンスにcharacterフィールドなし
  }
}
```

**重要: appliedCharacterId原則**
- `appliedCharacterId`はloadCharacter成功時のみセット
- frontmatter、レスポンスともに`appliedCharacterId`を基準に出力
- load失敗時はcharacterフィールドを一切出力しない（Phase Aのgenerate-image.jsと一貫）

#### 5. buildPrompt()にcharacterパラメータ追加
```javascript
function buildPrompt(mode, rawText, today, dinoContext, character) {
  let basePrompt;
  // 既存のモード分岐...

  // キャラクター設定注入
  if (character) {
    basePrompt = injectCharacterPrompt(basePrompt, character);
  }

  return basePrompt;
}
```

#### 6. Markdown frontmatterにcharacterフィールド追加（appliedCharacterId基準）
```javascript
// appliedCharacterIdがある場合のみfrontmatterに追加
if (appliedCharacterId) {
  frontmatter += `\ncharacter: "${appliedCharacterId}"`;
}
```
```yaml
# 通常モード + キャラクターload成功時（mode未出力=通常モード既存仕様維持）
---
title: "..."
date: 2026-03-18
tags: [...]
image_prompt: "..."
character: "quetz-default"
---

# 通常モード + キャラクターload失敗時（完全に従来と同じ）
---
title: "..."
date: 2026-03-18
tags: [...]
image_prompt: "..."
---

# 恐竜モード + キャラクターload成功時（mode出力=既存仕様維持）
---
title: "..."
date: 2026-03-18
tags: [...]
image_prompt: "..."
mode: "dino-story"
character: "quetz-default"
---
```

**重要: 既存frontmatter仕様の非回帰**
- 通常モード時: `mode`フィールドは出力しない（既存仕様維持）
- 恐竜モード時: `mode`フィールドを出力する（既存仕様維持）
- `character`フィールドは`appliedCharacterId`がある場合のみ純加算で追加

#### 7. 成功レスポンスにappliedCharacterId追加（既存フィールド完全維持）

**重要: 加算的変更のみ。既存レスポンスフィールドは一切変更しない。**

```javascript
// 既存レスポンス（tags, filePath, githubUrl, date, imageToken, mode 等）は完全維持
const response = {
  success: true,
  title,
  tags,
  filePath,
  githubUrl,
  date: today,
  imageToken,
  mode: effectiveMode,
  // ★ appliedCharacterIdがある場合のみ追加（既存フィールドに影響なし）
  ...(appliedCharacterId && { characterId: appliedCharacterId })
};
```

### セキュリティ考慮
- characterIdのフォーマット検証（`/^[a-z0-9-]{1,30}$/`）でパストラバーサル防止
- fail-open設計: キャラクター読み込み失敗時は通常日記として処理（課金済みClaude API呼び出しを無駄にしない）
- loadCharacter内のスキーマ検証で不正JSONを拒否
- **appliedCharacterId原則**: load成功時のみcharacterIdを出力（Phase Aと一貫）

### テスト追加項目（tests/create-diary-character.test.js 新規）
- characterId付きリクエストの正常処理（load成功→frontmatter/レスポンスにcharacterId）
- characterIdバリデーション（不正形式で400）
- キャラクター読み込み失敗時のフォールバック動作（frontmatter/レスポンスにcharacterId**なし**）
- characterId未指定時の後方互換（従来と同一動作）
- appliedCharacterId原則の検証
- **後方互換回帰テスト**: characterId追加時も既存フィールド（success, title, tags, filePath, githubUrl, date, imageToken, mode）が完全一致で維持されること

---

## Phase C: フロントエンドUI + キャラクターAPI

### 目的
ユーザーがキャラクターを選択して日記を作成できるUIを提供する。

### 変更ファイル
- `api/character.js`（新規 - GET API）
- `docs/diary-input.html`（UI追加）
- `tests/character-api.test.js`（新規テスト）

### 実装内容

#### 1. api/character.js（新規GET API）

**API契約:**
```
GET /api/character?characterId=quetz-default
```

| 項目 | 仕様 |
|------|------|
| メソッド | GET |
| パラメータ | `characterId`（クエリ文字列、任意、デフォルト: `'quetz-default'`） |
| パラメータ命名 | 他API（create-diary, generate-image）と統一して `characterId` |
| バリデーション | `/^[a-z0-9-]{1,30}$/`（他APIと同一パターン） |
| 認証 | 不要（キャラクター情報は公開データ） |
| CORS | 既存cors.js適用 |
| キャッシュ | `Cache-Control: public, max-age=300`（5分） |

**成功レスポンス（200）- 固定スキーマ:**
```json
{
  "characterId": "quetz-default",
  "name": "ケッツ",
  "nameEn": "Quetz",
  "species": {
    "common": "ケツァルコアトルス",
    "scientific": "Quetzalcoatlus northropi"
  },
  "personality": {
    "traits": ["好奇心旺盛", "おっとり"],
    "speechStyle": "〜だなぁ、〜なのだ",
    "firstPerson": "ボク",
    "catchphrase": "今日も空から見ると、いい一日だったなぁ〜"
  },
  "appearance": {
    "artStyle": "デフォルメ・イラスト"
  }
}
```

**必須フィールド:** `characterId`, `name`, `nameEn`, `species`, `personality`, `appearance`
- `characterId`: APIが付与（クエリパラメータの値）。JSON内の他IDフィールドは公開しない
- 内部フィールド（スキーマバージョン等）は除外し、上記必須フィールドのみ返却
- ID表現は `characterId` に統一（JSON内に `id` フィールドは含めない）

**キャッシュヘッダ方針:**
| ステータス | Cache-Control | Retry-After |
|-----------|---------------|-------------|
| 200 | `public, max-age=300` | - |
| 400/404/500 | `no-store` | - |
| 429 | `no-store` | 残りTTL秒数（必須） |

**404/500判別設計:**
- `loadCharacter()`はすべての失敗をnullに畳み込むため、api/character.jsでは直接使用しない
- 代わりにGitHub APIを直接呼び出し、レスポンスコードで判別する:
  - GitHub 404 → API 404（キャラクター未発見）
  - GitHub 403/429/5xx → API 500（upstream障害）
  - ネットワークエラー → API 500
  - JSONパース失敗/スキーマ不正 → API 500（データ異常）
- `validateCharacterSchema()`はcharacter.jsから再利用（内部export追加）

**エラーレスポンス:**
| ステータス | ボディ | 条件 |
|-----------|--------|------|
| 400 | `{ "error": "キャラクターIDの形式が不正です。" }` | バリデーション失敗 |
| 404 | `{ "error": "キャラクターが見つかりません。" }` | GitHub API 404（ファイル不存在に限定） |
| 429 | `{ "error": "レート制限を超えました。", "retryAfter": 86400 }` | レート超過 |
| 500 | `{ "error": "サーバーエラーです。" }` | upstream障害/データ異常/内部エラー |

**レート制限:**
- IP単位: `char_rate:{IP}:{YYYY-MM-DD}` = 30req/日（Upstash Redis）
- Redis障害時: **fail-closed**（500を返す。GitHub APIレート枯渇防止を優先）
- 429レスポンスに `Retry-After` ヘッダ（残りTTL秒数）を付与

#### 2. diary-input.html UI追加

**キャラクター選択セクション:**
- チェックボックス「キャラクターを使用する」（デフォルトON）
- キャラクタープレビュー表示（名前、画風）
- ページ読み込み時に `/api/character?characterId=quetz-default` をフェッチ

**キャラクター取得失敗時のフォールバック:**
- 取得失敗時（ネットワークエラー、429、500等）:
  1. チェックボックスを自動でOFFに切替
  2. `currentCharacterId = null`（characterId未送信で通常動作）
  3. UIに非ブロッキング警告を表示（「キャラクター読み込みに失敗しました。通常モードで動作します。」）
  4. 既存の日記作成フローは一切影響を受けない
- **後方互換保証**: characterId未送信時は全APIが従来通り動作

**API呼び出し修正:**
- create-diary POST bodyに `characterId` を含める（`currentCharacterId`がnullでない場合のみ）
- generate-image POST bodyに `characterId` を含める（同上）

### セキュリティ考慮
- character.js APIは認証不要（キャラクター設定は秘密情報ではない）
- CORSは既存のcors.jsで制御
- **IP単位レート制限**: 30req/日（GitHub APIレート枯渇防止）
- **Cache-Control**: 5分間の公開キャッシュで同一IDの連続アクセスを抑制

### テスト追加項目（tests/character-api.test.js 新規）

**基本機能:**
- 正常取得（characterId指定）
- characterIdバリデーション（不正形式で400）
- characterId省略時のデフォルト動作（quetz-default）
- GETのみ許可（POST→405）

**404/500判別:**
- GitHub 404 → API 404（キャラクター未発見）
- GitHub 403/5xx → API 500（upstream障害、404にしない）
- ネットワークエラー → API 500
- JSONパース失敗 → API 500
- スキーマ不正 → API 500

**レート制限・キャッシュ:**
- レート制限超過で429 + Retry-Afterヘッダ + body.retryAfter整合
- Redis障害時のfail-closed（500）
- 200時: `Cache-Control: public, max-age=300`
- 400/404/500時: `Cache-Control: no-store`
- 429時: `Cache-Control: no-store` + `Retry-After`ヘッダ

**レスポンス契約固定テスト:**
- 200時に `characterId` フィールド存在
- 200時に `id` フィールド不存在（非公開）
- 返却トップレベルキーが必須フィールド（characterId, name, nameEn, species, personality, appearance）のみ
- 内部フィールド（imageGeneration等）が漏洩していないこと

---

## Phase D: SNS連携キャプション拡張

### 目的
キャラクター有効時にSNS投稿のキャプション・テキストをキャラクター風に自動生成する。

### 変更ファイル
- `docs/diary-input.html`（キャプション生成ロジック修正）

### 実装内容

#### Instagram キャプション
```javascript
if (currentCharacterId && characterData) {
  autoCaption = [
    `${characterData.name}の日記`,
    '',
    result.title || '',
    '',
    (result.tags || []).map(t => t.startsWith('#') ? t : '#' + t).join(' '),
    '',
    `#${characterData.name}の日記 #AI日記`
  ].join('\n');
}
```

#### Bluesky テキスト
```javascript
if (currentCharacterId && characterData) {
  bsAutoText = [
    characterData.personality?.catchphrase || result.title,
    (result.tags || []).map(t => t.startsWith('#') ? t : '#' + t).join(' ')
  ].join('\n');
}
```

#### Threads テキスト
同様にキャラクター情報を反映。

### 文字数制限の切り詰め方針

**Bluesky（300 graphemes）:**
- 構成: catchphrase + tags
- 上限超過時の削除順: tags → catchphrase短縮（末尾「...」付き）
- grapheme計測: `Intl.Segmenter`使用（既存post-bluesky.jsと同一）

**Threads（500文字）:**
- 構成: キャラクター名の日記 + title + tags
- 上限超過時の削除順: tags → title短縮（末尾「...」付き）
- 文字計測: `String.length`（既存post-threads.jsと同一）

**Instagram（2200文字）:**
- 実質上限に達することはないため、切り詰め不要

### 注意点
- キャラクターデータはPhase Cで既にフェッチ済みのものを再利用
- **フォールバック**: `characterData`がnullの場合は従来キャプション（既存フローを壊さない）
- Phase D のロジックは `currentCharacterId && characterData` の両方がtruthyな場合のみ発動

### テスト追加項目（Phase Dはフロントエンドロジックのため、統合テストで検証）

Phase D固有のテスト項目は以下の統合テストに含める。

---

## 統合テスト（tests/character-integration.test.js 新規）

### 目的
Phase B/C/D横断でcharacterIdの伝搬・フォールバック・後方互換を検証する。

### テスト項目

#### characterId伝搬の一貫性
- character取得成功 → create-diary レスポンスに `characterId` あり
- character取得成功 → generate-image レスポンスに `characterId` あり
- create-diaryでload失敗 → レスポンスに `characterId` なし、generate-imageには影響しない（独立）
- generate-imageでload失敗 → レスポンスに `characterId` なし、create-diaryには影響しない

#### appliedCharacterId原則の横断検証
- create-diary: load成功時のみfrontmatterにcharacterフィールド出力
- generate-image: load成功時のみレスポンスにcharacterIdフィールド出力（Phase A実装済み）
- 両APIで同じcharacterIdを送信→両方成功時に同じappliedCharacterIdが返る

#### Phase D: SNSキャプション生成ロジック
- キャラクター有効時（`characterData` truthy）: キャラクター名入りキャプション生成
- キャラクター無効時（`characterData` null）: 従来キャプション生成（後方互換）
- Blueskyキャプション: 300 graphemes以内に収まること
- Threadsキャプション: 500文字以内に収まること
- characterData取得失敗 → 自動OFF → 従来キャプション（非破壊フォールバック）

---

## 実装順序

```
Phase B（create-diary.js）
  ↓ テスト通過確認
Phase C（フロントエンドUI + character API）
  ↓ テスト通過確認
Phase D（SNSキャプション拡張）
  ↓ 全テスト通過 + codex-review
コミット＆プッシュ
```

## エージェントチーム構成

| エージェント | 担当 | 並列可否 |
|------------|------|---------|
| implementer-B | Phase B: create-diary.js修正 + テスト | 先行 |
| implementer-C | Phase C: character API + フロントエンド | B完了後（characterIdレスポンス依存） |
| implementer-D | Phase D: SNSキャプション | C完了後（characterData依存） |
| qa-agent | 全テスト実行 + codex-review | 全Phase完了後 |

## 成功基準

- [ ] Phase B: characterId付き日記作成が正常動作（appliedCharacterId原則）
- [ ] Phase B: キャラクター読み込み失敗時のフォールバック動作
- [ ] Phase C: /api/character GET APIが正常動作（レート制限+キャッシュ）
- [ ] Phase C: フロントエンドでキャラクター選択・プレビュー表示
- [ ] Phase C: 取得失敗時の非破壊フォールバック（自動OFF+警告表示）
- [ ] Phase C: create-diary/generate-image呼び出しにcharacterIdが含まれる
- [ ] Phase D: キャラクター有効時にSNSキャプションが動的生成
- [ ] Phase D: 文字数制限（Bluesky 300 graphemes、Threads 500文字）の遵守
- [ ] 統合テスト: characterId伝搬の一貫性検証通過
- [ ] 全テスト通過（300+α）
- [ ] codex-review ok: true
