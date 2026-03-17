# Idea-1: 恐竜日記システム - 実装計画

> **作成日**: 2026-03-17
> **対象**: voice-diary Phase 6（恐竜日記拡張）
> **方式**: Vercel Serverless Functions (Node.js ES Modules)
> **関連skill**: dino-evo-sim, dinoresearch-ai

---

## 1. 概要・目的

### 背景

voice-diaryは音声入力から自動で日記を生成するシステムである。現在Phase 5.5まで完了し、日記作成→画像生成→Instagram/Bluesky/Threads投稿の一連のフローが確立されている。

### 目的

「もし恐竜が現代まで生存していたら」という世界観（dino-evo-sim）と恐竜リサーチ情報（dinoresearch-ai）を日記に統合し、以下を実現する:

1. **恐竜テーマ日記モード**: 日記作成時に恐竜の進化シミュレーション結果を組み込み、パラレルワールドの日記として整形する
2. **リサーチ日記モード**: 恐竜に関する調査・研究内容を日記として投稿できるようにする
3. **画像生成の世界観統一**: DALL-E 3画像生成時に「恐竜が現代にいる」世界観のプロンプトを自動付与する

### 設計方針

- 既存のcreate-diary.js / generate-image.jsのパターンを完全に踏襲する
- 新規APIは最小限に抑え、既存APIの拡張（モードパラメータ）を優先する
- dino-evo-sim / dinoresearch-aiとの連携はClaude APIプロンプトレベルで実現し、外部サービス依存を増やさない

---

## 2. 技術設計

### 2.1 アーキテクチャ概要

```
[入力] 音声/テキスト（ブラウザ）
  ↓
[フロントエンド] diary-input.html
  - 「通常モード」/「恐竜日記モード」/「リサーチ日記モード」選択UI
  - 恐竜日記モード: dino-evo-simパラメータ入力（時代、恐竜種、シナリオ）
  - リサーチ日記モード: 研究テーマ入力
  ↓
[API] POST /api/create-diary（既存API拡張）
  - 新パラメータ: mode ("normal" | "dino-story" | "dino-research")
  - 新パラメータ: dinoContext（恐竜コンテキスト情報）
  - Claude APIプロンプトをモードに応じて切り替え
  - image_promptに世界観を反映
  ↓
[API] POST /api/generate-image（拡張: filePath対応）
  - create-diaryレスポンスの filePath を受け取り、正しい日記ファイルを参照
  - image_promptは日記ファイルから取得（モード付きファイル名に対応）
  ↓
[API] 既存SNS投稿API群（filePath対応の最小拡張）
  - post-instagram.js / post-bluesky.js / post-threads.js
  - filePath パラメータ追加（モード付きファイル名を正しく参照）
```

### 2.2 データフロー

#### 恐竜日記モード（dino-story）

```
ユーザー入力:
  rawText: "今日はカフェで友達とランチした"
  mode: "dino-story"
  dinoContext: {
    era: "modern",           // 現代（恐竜が生き延びた世界線）
    species: "velociraptor", // 主要登場恐竜
    scenario: "coexistence"  // 共存シナリオ
  }
    ↓
Claude APIプロンプト（恐竜世界観付き）:
  - 通常の日記整形ルールに加え、恐竜が現代に存在する世界線を反映
  - 例: カフェの隣にラプトル用の席がある、恐竜交通レーンがある等
    ↓
出力:
  - title: "ラプトルカフェでの昼下がり"
  - body: 恐竜共存世界の日記本文
  - image_prompt: "A modern Japanese cafe with a velociraptor..."
  - tags: [#恐竜日記, #DinoWorld, #ラプトル, ...]
```

#### リサーチ日記モード（dino-research）

```
ユーザー入力:
  rawText: "ティラノサウルスの羽毛について調べた..."
  mode: "dino-research"
  dinoContext: {
    topic: "T-Rex feather evolution",
    sources: ["Nature 2024", "PaleoReview"]  // 任意
  }
    ↓
Claude APIプロンプト（リサーチ整形）:
  - 口語→文語変換に加え、研究ノート形式で整形
  - 考察・発見・疑問点を構造化
    ↓
出力:
  - title: "ティラノサウルスの羽毛 - 研究ノート"
  - body: 研究ノート形式の本文（背景・発見・考察・次の調査）
  - image_prompt: "A scientifically accurate T-Rex with proto-feathers..."
  - tags: [#恐竜研究, #ティラノサウルス, #古生物学, ...]
```

### 2.3 日記ファイルフォーマット拡張

```markdown
---
title: "ラプトルカフェでの昼下がり"
date: 2026-03-17
tags: ["#恐竜日記", "#DinoWorld", "#ラプトル"]
image_prompt: "A modern Japanese cafe with a velociraptor..."
mode: "dino-story"
dino_context:
  era: "modern"
  species: "velociraptor"
  scenario: "coexistence"
---

# ラプトルカフェでの昼下がり

## 2026-03-17

### サマリー

...（以下既存フォーマットと同一）
```

**注意**: `mode`と`dino_context`はYAML frontmatterに追加するオプショナルフィールド。既存の日記ファイルとの後方互換性を維持する（`mode`未指定 = "normal"）。

### 2.4 同日複数モード日記のファイルパス設計

同日に異なるモードで日記を作成した場合のファイル上書きを防止するため、モード付き日記はファイル名にサフィックスを付与する。

| モード | ファイルパス例 |
|--------|-------------|
| normal（既存互換） | `diaries/2026/03/2026-03-17.md` |
| dino-story | `diaries/2026/03/2026-03-17-dino-story.md` |
| dino-research | `diaries/2026/03/2026-03-17-dino-research.md` |

```javascript
const modeSuffix = (mode && mode !== 'normal') ? `-${mode}` : '';
const filePath = `diaries/${year}/${month}/${date}${modeSuffix}.md`;
```

### 2.5 generate-image.js の filePath 対応

現行の `generate-image.js` は `date` パラメータから `diaries/YYYY/MM/YYYY-MM-DD.md` を固定構築して日記ファイルを読み込む。モード付きファイル名の導入に伴い、`filePath` パラメータを追加して正しいファイルを参照できるようにする。

**変更内容:**
```javascript
// リクエストボディに filePath を追加（任意）
const { date, imageToken, filePath } = req.body;

// ファイルパス構築（filePath指定時はそれを使用、未指定時は従来通り）
const diaryPath = filePath || `diaries/${year}/${month}/${date}.md`;
```

**filePath検証（パストラバーサル防止）:**
```javascript
if (filePath && !/^diaries\/\d{4}\/\d{2}\/[\w-]+\.md$/.test(filePath)) {
  return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
}
```

**create-diary → generate-image の連携:**
- create-diary.jsのレスポンスに `filePath` を含める（既存）
- フロントエンドが generate-image 呼び出し時に `filePath` を引き渡す
- SNS投稿APIにも同様に `filePath` を引き渡す

---

## 3. 実装フェーズ

### Phase 6a: バックエンド拡張（create-diary.js + generate-image.js）

| # | タスク | 見積もり |
|---|--------|----------|
| 1 | create-diary.jsにmode/dinoContextパラメータ追加 | 1h |
| 2 | 入力検証ロジック追加（mode enum、dinoContext型検証） | 1h |
| 3 | Claude APIプロンプト分岐（3モード分のプロンプト設計） | 2h |
| 4 | LLM出力スキーマ検証の拡張（mode/dino_context追加） | 0.5h |
| 5 | Markdownテンプレート拡張（YAML frontmatterにmode/dino_context） | 0.5h |
| 6 | generate-image.jsにfilePath対応追加 | 0.5h |
| 7 | テスト追加（create-diary-ratelimit.test.js拡張 or 新規テスト） | 2h |

### Phase 6b: フロントエンド拡張（diary-input.html）

| # | タスク | 見積もり |
|---|--------|----------|
| 7 | モード選択UI（タブまたはセレクトボックス） | 1h |
| 8 | 恐竜日記モード用コンテキスト入力フォーム | 1.5h |
| 9 | リサーチ日記モード用入力フォーム | 1h |
| 10 | UIのスタイリング（style.css） | 0.5h |

### Phase 6c: SNS API filePath対応

| # | タスク | 見積もり |
|---|--------|----------|
| 11 | post-instagram.js に filePath パラメータ追加 | 30min |
| 12 | post-bluesky.js に filePath パラメータ追加 | 30min |
| 13 | post-threads.js に filePath パラメータ追加 | 30min |
| 14 | 既存SNSテスト更新（filePath対応テスト追加） | 1h |

**SNS API filePath検証仕様（3ファイル共通）:**
```javascript
// filePath検証（パストラバーサル防止）- generate-image.jsと同等
if (filePath !== undefined) {
  if (typeof filePath !== 'string') {
    return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
  }
  if (!/^diaries\/\d{4}\/\d{2}\/[\w-]+\.md$/.test(filePath)) {
    return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
  }
  if (filePath.includes('..') || filePath.includes('//')) {
    return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
  }
}
```

### Phase 6d: テスト・ドキュメント

| # | タスク | 見積もり |
|---|--------|----------|
| 15 | 統合テスト（モード別の正常系・異常系） | 2h |
| 16 | CLAUDE.md更新 | 0.5h |
| 17 | codex-review実施・修正反復 | 1h |

**合計見積もり: 約17時間（3日程度）**

---

## 4. API設計

### 4.1 POST /api/create-diary（既存API拡張）

**リクエストボディ（拡張）:**

```json
{
  "rawText": "今日はカフェで友達とランチした",
  "mode": "dino-story",
  "dinoContext": {
    "era": "modern",
    "species": "velociraptor",
    "scenario": "coexistence"
  }
}
```

**パラメータ詳細:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| rawText | string | Yes | 日記の生テキスト（既存、最大10,000文字） |
| mode | string | No | "normal"（デフォルト）/ "dino-story" / "dino-research" |
| dinoContext | object | No | mode="dino-story"または"dino-research"時に使用 |
| dinoContext.era | string | No | "mesozoic" / "modern" / "future"（dino-storyモード用） |
| dinoContext.species | string | No | 恐竜種名（英語、最大50文字） |
| dinoContext.scenario | string | No | "coexistence" / "dominance" / "hidden"（dino-storyモード用） |
| dinoContext.topic | string | No | 研究テーマ（dino-researchモード用、最大200文字） |
| dinoContext.sources | string[] | No | 参考文献リスト（最大5件、各100文字以内） |

**入力検証ルール:**

```javascript
// mode検証
const VALID_MODES = ['normal', 'dino-story', 'dino-research'];
if (mode && !VALID_MODES.includes(mode)) {
  return res.status(400).json({ error: '不正なモードです。' });
}

// dinoContext検証（modeがdino-*の場合のみ）
if (mode?.startsWith('dino-') && dinoContext) {
  if (typeof dinoContext !== 'object' || Array.isArray(dinoContext)) {
    return res.status(400).json({ error: '不正なコンテキスト形式です。' });
  }
  // era検証（ホワイトリスト）
  const VALID_ERAS = ['mesozoic', 'modern', 'future'];
  if (dinoContext.era && !VALID_ERAS.includes(dinoContext.era)) {
    return res.status(400).json({ error: '不正な時代設定です。' });
  }
  // scenario検証（ホワイトリスト）
  const VALID_SCENARIOS = ['coexistence', 'dominance', 'hidden'];
  if (dinoContext.scenario && !VALID_SCENARIOS.includes(dinoContext.scenario)) {
    return res.status(400).json({ error: '不正なシナリオです。' });
  }
  // species: 50文字以内（長さ制限のみ、学名表記のピリオド等を許容）
  if (dinoContext.species && (typeof dinoContext.species !== 'string' || dinoContext.species.length > 50)) {
    return res.status(400).json({ error: '恐竜種名が不正です。' });
  }
  // topic: 200文字以内、制御文字・マークダウン記法を除去
  if (dinoContext.topic && (typeof dinoContext.topic !== 'string' || dinoContext.topic.length > 200)) {
    return res.status(400).json({ error: '研究テーマが不正です。' });
  }
  // sources: 最大5件、各要素string型・100文字以内・サニタイズ処理
  if (dinoContext.sources) {
    if (!Array.isArray(dinoContext.sources) || dinoContext.sources.length > 5) {
      return res.status(400).json({ error: '参考文献リストが不正です。' });
    }
    for (const source of dinoContext.sources) {
      if (typeof source !== 'string' || source.length > 100) {
        return res.status(400).json({ error: '参考文献の要素が不正です。' });
      }
    }
    // サニタイズ: 制御文字・マークダウン記法（```、---等）を除去
    dinoContext.sources = dinoContext.sources.map(s =>
      s.replace(/[\x00-\x1f]/g, '').replace(/```/g, '').replace(/^---$/gm, '')
    );
  }
  // topic: サニタイズ処理（制御文字・マークダウン記法の除去）
  if (dinoContext.topic) {
    dinoContext.topic = dinoContext.topic
      .replace(/[\x00-\x1f]/g, '').replace(/```/g, '').replace(/^---$/gm, '');
  }
}
```

**レスポンス（既存フィールド + 拡張）:**

```json
{
  "success": true,
  "title": "ラプトルカフェでの昼下がり",
  "tags": ["#恐竜日記", "#DinoWorld"],
  "filePath": "diaries/2026/03/2026-03-17-dino-story.md",
  "githubUrl": "...",
  "date": "2026-03-17",
  "imageToken": "...",
  "mode": "dino-story"
}
```

### 4.2 Claude APIプロンプト設計

#### 恐竜日記モード（dino-story）プロンプト

```
あなたは日記執筆のアシスタントです。以下の音声入力テキストを、
「恐竜が絶滅せず現代まで進化し続けた」パラレルワールドの日記として整形してください。

【世界観設定】
- 恐竜は6600万年前に絶滅せず、現代まで進化を続けた
- 人類と恐竜は共存している
- 時代: ${era}
- 主要登場恐竜: ${species}
- シナリオ: ${scenario}

【音声入力テキスト】
${rawText}

【整形ルール】
1. 日常の出来事に自然に恐竜を組み込む（無理のない範囲で）
2. 科学的にもっともらしい恐竜の進化形態を想像する
3. ユーモアと驚きを含む読み物として面白い日記にする
4. 口語→文語変換は通常の日記と同様に行う
5. image_promptは「恐竜が現代にいる」情景を具体的に描写する

【出力形式】
（既存のJSON形式と同一）
```

#### リサーチ日記モード（dino-research）プロンプト

```
あなたは古生物学の研究ノート執筆アシスタントです。以下の調査メモを、
構造化された研究ノート形式の日記に整形してください。

【研究テーマ】
${topic}

【参考文献】
${sources.join('\n')}

【調査メモ】
${rawText}

【整形ルール】
1. 以下の構造で本文を整形する:
   - 背景・動機
   - 調査内容・発見
   - 考察・仮説
   - 残る疑問・次の調査計画
2. 専門用語は読みやすく解説を添える
3. image_promptは科学的に正確な恐竜のイラスト指示にする
4. タグに研究分野・恐竜種を含める

【出力形式】
（既存のJSON形式と同一）
```

---

## 5. フロントエンド変更

### 5.1 diary-input.html変更内容

1. **モード選択UI**: テキストエリアの上にタブ型UIを追加
   - 「通常日記」「恐竜日記」「リサーチ日記」の3タブ
   - タブ切り替えで追加入力フォームの表示/非表示を制御

2. **恐竜日記モード追加フォーム**:
   - 時代セレクト（中生代/現代/未来）
   - 恐竜種テキスト入力（オートコンプリート候補あり）
   - シナリオセレクト（共存/支配/隠遁）

3. **リサーチ日記モード追加フォーム**:
   - 研究テーマテキスト入力
   - 参考文献入力（動的追加/削除可能）

4. **リクエスト送信の変更**: fetch呼び出しにmode/dinoContextを追加

**実装パターン**: 既存のdiary-input.htmlはDOM構築パターン（XSS対策）を使用しており、追加UIも同一パターンに従う。

### 5.2 style.css変更内容

- `.mode-tabs` - タブUI用スタイル
- `.dino-context-form` - 恐竜コンテキスト入力フォーム
- `.research-context-form` - リサーチコンテキスト入力フォーム
- 既存のレスポンシブデザインパターンを踏襲

---

## 6. テスト計画

### 6.1 既存テスト影響

`tests/create-diary-ratelimit.test.js` の既存12テストは変更なし（modeパラメータ未指定時は"normal"動作）。

### 6.2 新規テスト

新規テストファイル: `tests/create-diary-dino.test.js`

| # | テストケース | 種別 |
|---|-------------|------|
| 1 | mode="dino-story"で正常な日記作成 | 正常系 |
| 2 | mode="dino-research"で正常な日記作成 | 正常系 |
| 3 | mode未指定で従来通りの動作（後方互換） | 正常系 |
| 4 | 不正なmode値で400エラー | 異常系 |
| 5 | dinoContext型不正で400エラー | 異常系 |
| 6 | dinoContext.speciesが50文字超過で400エラー | 異常系 |
| 7 | dinoContext.topicが200文字超過で400エラー | 異常系 |
| 8 | dinoContext.sourcesが5件超過で400エラー | 異常系 |
| 9 | mode="dino-story"でdinoContextなしでも動作（デフォルト世界観） | 正常系 |
| 10 | mode="normal"でdinoContext指定時は無視される | 正常系 |
| 11 | Claude APIレスポンスにmode/dino_contextが含まれるMarkdown生成 | 正常系 |
| 12 | LLM出力スキーマ検証がmode付きでも動作 | 正常系 |
| 13 | mode="dino-story"時にClaude APIリクエストに恐竜世界観プロンプトが含まれる | 正常系 |
| 14 | mode="dino-research"時にClaude APIリクエストに研究ノートプロンプトが含まれる | 正常系 |
| 15 | mode未指定時に既存プロンプトが使用される | 正常系 |
| 16 | モード付きファイル名でgenerate-imageがfilePathを正しく参照する | 正常系 |
| 17 | filePath未指定時にgenerate-imageが従来のdate固定パスを使用する | 正常系 |
| 18 | dinoContext.sources各要素の型・長さ検証 | 異常系 |
| 19 | dinoContext.sources/topicのサニタイズ処理（制御文字・MD記法除去） | 正常系 |
| 20 | SNS APIのfilePath検証（パストラバーサル防止） | 異常系 |

**テストパターン**: `tests/post-instagram.test.js`のモック構造（global.fetch stub、process.env設定）を参照実装とする。

---

## 7. セキュリティ考慮事項

### 7.1 入力検証

- `mode`: 列挙型（"normal" / "dino-story" / "dino-research"）、ホワイトリスト検証
- `dinoContext`: オブジェクト型検証、各フィールドの型・長さ制限
- `dinoContext.species`: 文字列50文字以内（学名表記のピリオド等を許容するため長さ制限のみ）
- `dinoContext.topic`: 文字列200文字以内
- `dinoContext.sources`: 配列最大5件、各100文字以内
- プロンプトインジェクション対策:
  - `dinoContext.topic`/`dinoContext.sources`: 制御文字・マークダウン記法（` ``` `、`---`等）を除去するサニタイズ処理を実施
  - プロンプトテンプレート内でユーザー入力をXMLタグ（`<user_input>`）で囲み、Claude APIの入力境界を明確化
  - LLM出力スキーマ検証で出力側も防御

### 7.2 LLM出力検証

既存のvalidateDiaryData関数はそのまま使用可能。YAML frontmatterに追加するmode/dino_contextは、入力値をそのまま書き込む（LLM出力ではない）ため、入力検証のみで十分。

### 7.3 レート制限

追加のレート制限は不要。既存のcreate-diary APIのレート制限（30req/日/IP）がモードに関係なく適用される。

### 7.4 認証

変更なし。既存のJWT認証 + AUTH_TOKENフォールバックをそのまま使用。

---

## 8. リスクと依存関係

### 8.1 リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| Claude APIプロンプトの品質 | 恐竜世界観の日記が不自然になる可能性 | プロンプトの反復改善、few-shot examples追加 |
| DALL-E 3の恐竜画像品質 | 科学的に不正確な恐竜画像が生成される可能性 | image_promptに"scientifically accurate"等の指示を含める |
| dinoContextのプロンプトインジェクション | 悪意ある入力でプロンプトが操作される | 入力サニタイズ + XMLタグ境界 + LLM出力スキーマ検証 |
| 既存テストへのregression | mode追加で既存動作が壊れる | mode未指定時は完全に既存動作を維持、既存テスト全通過を確認 |

### 8.2 依存関係

| 依存 | 種別 | 状態 |
|------|------|------|
| Claude API (Anthropic) | 外部API | 既存（変更なし） |
| DALL-E 3 (OpenAI) | 外部API | 既存（変更なし） |
| GitHub API | 外部API | 既存（変更なし） |
| Upstash Redis | 外部API | 既存（変更なし） |
| dino-evo-sim skill | Claude Code skill | プロンプト設計に世界観を参照（直接API呼び出しなし） |
| dinoresearch-ai skill | Claude Code skill | リサーチモードのプロンプト設計に参照（直接API呼び出しなし） |

**重要**: dino-evo-sim / dinoresearch-aiとの連携は、Claude APIプロンプトに世界観やリサーチ知識を埋め込む形で実現する。これらのskillを実行時にAPI呼び出しすることはない（外部依存を増やさない設計方針）。

---

## 9. 見積もり（規模感）

### 変更ファイル数

| 種別 | ファイル | 変更内容 |
|------|---------|---------|
| API | api/create-diary.js | mode/dinoContext対応、プロンプト分岐 |
| API | api/generate-image.js | filePath対応追加 |
| API | api/post-instagram.js | filePath対応追加 |
| API | api/post-bluesky.js | filePath対応追加 |
| API | api/post-threads.js | filePath対応追加 |
| フロント | docs/diary-input.html | モード選択UI、追加フォーム、filePath引き渡し |
| スタイル | docs/style.css | 新規UIのスタイル |
| テスト | tests/create-diary-dino.test.js | 新規テストファイル（20テスト） |
| ドキュメント | CLAUDE.md | Phase 6情報追記 |

**変更ファイル: 9ファイル（うち新規1ファイル）**

### コード量見積もり

- api/create-diary.js: +80行（入力検証 +30行、プロンプト分岐 +40行、Markdown拡張 +10行）
- api/generate-image.js: +15行（filePath対応）
- api/post-instagram.js: +10行（filePath対応）
- api/post-bluesky.js: +10行（filePath対応）
- api/post-threads.js: +10行（filePath対応）
- docs/diary-input.html: +120行（モード選択UI、コンテキストフォーム）
- docs/style.css: +40行
- tests/create-diary-dino.test.js: +420行（17テスト）
- CLAUDE.md: +20行

**合計: 約725行追加**

### 工数

- 実装: 8-10時間
- テスト: 3-4時間
- codex-review + 修正: 1-2時間
- **合計: 12-16時間（2-3日）**

---

## 完了基準

- [ ] create-diary.jsにmode/dinoContextパラメータ追加
- [ ] 3モード分のClaudeプロンプト実装
- [ ] 入力検証・LLM出力スキーマ検証対応
- [ ] diary-input.htmlにモード選択UI追加
- [ ] 新規テスト20テスト通過
- [ ] 既存168テスト全通過（後方互換性）
- [ ] codex-review ok: true
- [ ] Vercelデプロイ成功
- [ ] 本番で恐竜日記モード動作確認
