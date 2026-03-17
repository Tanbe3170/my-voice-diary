# Idea 3: リサーチ投稿機能 - 実装計画

> **作成日**: 2026-03-17
> **対象**: voice-diary リサーチ投稿機能（Phase 6候補）
> **方式**: Vercel Serverless Functions (Node.js ES Modules)
> **ステータス**: 計画段階

---

## 1. 概要・目的

### 背景
voice-diaryは現在、日常の日記をClaude APIで整形し、DALL-E 3で画像を生成し、Instagram/Bluesky/Threadsに自動投稿する機能を備えている。しかし、日記以外のコンテンツ（技術調査、恐竜進化リサーチ、スキルアップ記録など）をSNSに投稿する仕組みがない。

### 目的
- 調査・研究内容をSNS投稿可能なフォーマットに変換する
- 恐竜進化リサーチ、技術調査、スキルアップ記録を構造化して保存する
- 既存のSNS投稿パイプライン（画像生成 → Instagram/Bluesky/Threads）を再利用する
- 日記とリサーチを明確に区分しつつ、統一的なUIで操作できるようにする

### 設計方針
- 既存パターン（JWT認証、Upstash Redis、CORS、fail-closed）を完全踏襲
- `api/post-instagram.js` を参照実装としたセキュリティパターン統一
- 新規API `api/create-research.js` として独立実装（create-diary.jsとの責務分離）

---

## 2. コンテンツタイプ設計

### 日記 vs リサーチ投稿

| 項目 | 日記 (diary) | リサーチ (research) |
|------|-------------|-------------------|
| 入力 | 口語テキスト（音声入力） | 調査メモ・要点テキスト |
| Claude整形 | 口語→文語変換 | 要点→解説記事変換 |
| 保存先 | `diaries/YYYY/MM/YYYY-MM-DD.md` | `research/YYYY/MM/YYYY-MM-DD-{slug}.md` |
| 1日の上限 | 1ファイル（上書き） | 複数ファイル可（slug区別） |
| frontmatter | title, date, tags, image_prompt | title, date, tags, image_prompt, **topic**, **category**, **sources** |
| SNSフォーマット | タイトル + サマリー + タグ | トピック + キーポイント + タグ |
| 画像生成 | 日記の情景画像 | リサーチテーマのコンセプト画像 |

### カテゴリ定義

| カテゴリ | 説明 | 例 |
|---------|------|-----|
| `dinosaur` | 恐竜進化リサーチ | 恐竜の飛行進化、羽毛恐竜の系統 |
| `tech` | 技術調査 | Vercel Edge Functions、WebGPU |
| `skill` | スキルアップ記録 | デザインスキル、3Dモデリング |
| `general` | その他の調査 | 歴史、科学、文化 |

---

## 3. API設計

### 3.1 新規API: `POST /api/create-research`

**方式**: 新規ファイル `api/create-research.js`

**理由（create-diary.js拡張を不採用とした根拠）**:
- Claude APIプロンプトが根本的に異なる（口語→文語 vs 要点→解説記事）
- LLM出力スキーマが異なる（topic, category, sources フィールド追加）
- ファイルパスのロジックが異なる（slug生成、複数ファイル対応）
- 単一責任原則: 1 API = 1コンテンツタイプ

**リクエスト**:
```json
{
  "rawText": "恐竜の飛行進化について調べた。始祖鳥は...",
  "category": "dinosaur",
  "topic": "恐竜の飛行進化"
}
```

| フィールド | 型 | 必須 | 検証 |
|-----------|-----|------|------|
| rawText | string | 必須 | 1-10000文字 |
| category | string | 任意 | `dinosaur` / `tech` / `skill` / `general` のいずれか。省略時は `general` |
| topic | string | 任意 | 1-50文字。省略時はClaude APIが自動生成 |

**レスポンス**（成功時）:
```json
{
  "success": true,
  "title": "始祖鳥から現代の鳥類へ：飛行進化の軌跡",
  "topic": "恐竜の飛行進化",
  "category": "dinosaur",
  "tags": ["#恐竜", "#進化", "#始祖鳥"],
  "filePath": "research/2026/03/2026-03-17-flight-evolution.md",
  "githubUrl": "https://github.com/.../blob/main/research/2026/03/2026-03-17-flight-evolution.md",
  "date": "2026-03-17",
  "slug": "flight-evolution",
  "imageToken": "1710...:abc123..."
}
```

**セキュリティ**:
- JWT認証 + AUTH_TOKENフォールバック（create-diary.jsと同一パターン）
- Upstash Redisレート制限: `research_rate:{IP}:{YYYY-MM-DD}` 15req/日
- fail-closed設計
- LLM出力スキーマ検証

### 3.2 Claude APIプロンプト（リサーチ用）

```
あなたはリサーチ記事のライティングアシスタントです。以下の調査メモを、
読みやすい解説記事に整形してください。

【調査メモ】
${rawText}

【トピック（任意）】
${topic || '調査メモから自動推定してください'}

【カテゴリ】
${category}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

{
  "date": "${today}",
  "title": "読者の興味を引くタイトル（20文字以内）",
  "topic": "調査トピック名（15文字以内）",
  "category": "${category}",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "key_points": ["重要ポイント1", "重要ポイント2", "重要ポイント3"],
  "body": "詳細な解説記事（段落分けあり、わかりやすい文章）",
  "sources": ["参考にした情報源があれば記載"],
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "このリサーチから1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）",
  "slug": "英語のURL用スラッグ（ハイフン区切り、3-5単語）"
}

【整形のルール】
1. 専門用語は初出時に簡潔な説明を添える
2. key_pointsは核心となるポイントを3-5個
3. 本文は論理的な構成で段落分けする
4. タグはSNS投稿を想定（#リサーチ #テーマ名 など）
5. 画像プロンプトはテーマを視覚的に表す具体的な英語で記述
6. slugは簡潔で意味が通る英語
```

### 3.3 LLM出力スキーマ検証

```javascript
const validateResearchData = (data) => {
  const errors = [];

  // title検証（string、1-50文字）
  if (!data.title || typeof data.title !== 'string') errors.push('titleが不正');
  else if (data.title.length > 50) errors.push('titleが長すぎます（50文字以内）');

  // topic検証（string、1-50文字）
  if (!data.topic || typeof data.topic !== 'string') errors.push('topicが不正');
  else if (data.topic.length > 50) errors.push('topicが長すぎます（50文字以内）');

  // category検証
  const validCategories = ['dinosaur', 'tech', 'skill', 'general'];
  if (!validCategories.includes(data.category)) errors.push('categoryが不正');

  // summary検証（string、1-500文字）
  if (!data.summary || typeof data.summary !== 'string') errors.push('summaryが不正');
  else if (data.summary.length > 500) errors.push('summaryが長すぎます');

  // key_points検証（配列、各要素string、最大10個）
  if (!Array.isArray(data.key_points)) errors.push('key_pointsが配列ではありません');
  else if (data.key_points.length > 10) errors.push('key_pointsが多すぎます');

  // body検証（string、1-10000文字）
  if (!data.body || typeof data.body !== 'string') errors.push('bodyが不正');
  else if (data.body.length > 10000) errors.push('bodyが長すぎます');

  // tags検証（配列、各要素string、最大10個）
  if (!Array.isArray(data.tags)) errors.push('tagsが配列ではありません');
  else if (data.tags.length > 10) errors.push('tagsが多すぎます');

  // image_prompt検証（string、1-500文字）
  if (!data.image_prompt || typeof data.image_prompt !== 'string') errors.push('image_promptが不正');
  else if (data.image_prompt.length > 500) errors.push('image_promptが長すぎます');

  // slug検証（英数字+ハイフン、3-50文字）
  if (!data.slug || typeof data.slug !== 'string') errors.push('slugが不正');
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.slug)) errors.push('slugの形式が不正');
  else if (data.slug.length > 50) errors.push('slugが長すぎます');

  // sources検証（任意、配列）
  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources)) errors.push('sourcesが配列ではありません');
  }

  return errors;
};
```

### 3.4 Markdownファイルフォーマット（リサーチ用）

```markdown
---
title: "始祖鳥から現代の鳥類へ：飛行進化の軌跡"
date: 2026-03-17
type: research
topic: "恐竜の飛行進化"
category: dinosaur
tags: ["#恐竜", "#進化", "#始祖鳥", "#飛行", "#古生物学"]
sources: ["参考文献1", "参考文献2"]
image_prompt: "Archaeopteryx transitioning into modern bird, evolutionary timeline..."
slug: flight-evolution
---

# 始祖鳥から現代の鳥類へ：飛行進化の軌跡

## 2026-03-17

### トピック: 恐竜の飛行進化

### サマリー

始祖鳥の発見が古生物学に与えた衝撃を振り返る。
飛行能力の段階的な進化過程を解説。
現代の鳥類へと繋がる進化の系譜を辿る。

### キーポイント

- 始祖鳥は最古の鳥類化石として1861年に発見された
- 飛行能力は滑空→羽ばたき飛行へと段階的に進化
- 羽毛は当初体温調節が目的で、飛行は副次的だった

---

詳細な解説本文...

---

**Sources:** 参考文献1, 参考文献2

**Tags:** #恐竜 #進化 #始祖鳥 #飛行 #古生物学
```

---

## 4. 保存先設計

### ディレクトリ構造

```
voice-diary/
├── diaries/              # 既存: 日記ファイル
│   └── YYYY/MM/YYYY-MM-DD.md
├── research/             # 新規: リサーチファイル
│   └── YYYY/MM/YYYY-MM-DD-{slug}.md
```

### ファイルパス規則

- **日記**: `diaries/2026/03/2026-03-17.md` （1日1ファイル、上書き）
- **リサーチ**: `research/2026/03/2026-03-17-flight-evolution.md` （slug付き、複数可）

### slug生成

- Claude APIが英語slugを生成（例: `flight-evolution`）
- 検証: `/^[a-z0-9]+(-[a-z0-9]+)*$/`（英小文字・数字・ハイフンのみ）
- 同一日・同一slugの場合: GitHub APIのSHA取得 → 上書き（既存と同じ挙動）

---

## 5. SNS投稿フォーマット（リサーチ向け）

### 既存SNS APIの拡張

SNS投稿API（post-instagram, post-bluesky, post-threads）は現在 `date` パラメータからファイルパスを `diaries/{year}/{month}/{date}.md` として構築している。リサーチ対応のため `filePath` パラメータを追加する。

**変更箇所（3ファイル共通、最小変更）**:

```javascript
// 現在のファイルパス構築
const year = date.split('-')[0];
const month = date.split('-')[1];
const diaryPath = `diaries/${year}/${month}/${date}.md`;

// 変更後
const diaryPath = filePath || `diaries/${year}/${month}/${date}.md`;
```

**リクエストボディ拡張**:
```json
{
  "date": "2026-03-17",
  "filePath": "research/2026/03/2026-03-17-flight-evolution.md",
  "text": "恐竜の飛行進化\n\n始祖鳥から..."
}
```

- `filePath` はオプション。省略時は従来通り `diaries/` から取得
- `filePath` 検証: `^(diaries|research)/\d{4}/\d{2}/` で始まること（パストラバーサル防止）
- `date` は引き続き必須（冪等性キーとして使用）

### SNSテキスト自動生成（リサーチ用）

日記とリサーチでテキスト生成ロジックを分岐:

```
[日記の場合]
タイトル
サマリー
#タグ1 #タグ2

[リサーチの場合]
トピック名
タイトル
キーポイント1
キーポイント2
#タグ1 #タグ2
```

この分岐はフロントエンド（diary-input.html）で行い、SNS APIには `text` パラメータとして渡す。SNS API側の変更は `filePath` 対応のみ。

---

## 6. フロントエンド変更

### diary-input.html の拡張

**モード切替UI**:
```html
<div class="content-type-selector">
  <button class="type-btn active" data-type="diary">日記</button>
  <button class="type-btn" data-type="research">リサーチ</button>
</div>
```

**リサーチモード時の追加フィールド**:
```html
<!-- リサーチモード時のみ表示 -->
<div id="research-fields" style="display:none;">
  <label for="research-category">カテゴリ</label>
  <select id="research-category">
    <option value="general">一般</option>
    <option value="dinosaur">恐竜</option>
    <option value="tech">技術</option>
    <option value="skill">スキルアップ</option>
  </select>

  <label for="research-topic">トピック（任意）</label>
  <input type="text" id="research-topic" maxlength="50"
         placeholder="例: 恐竜の飛行進化">
</div>
```

**送信ロジック分岐**:
- 日記モード: `POST /api/create-diary` （既存）
- リサーチモード: `POST /api/create-research` （新規）
- 画像生成: `POST /api/generate-image` に `filePath` を引き渡す（下記参照）
- SNS投稿: 各SNS APIに `filePath` を引き渡す

**create-research → generate-image → SNS の filePath 統一フロー:**
```
1. create-research レスポンス → filePath: "research/2026/03/2026-03-17-flight-evolution.md"
2. フロントエンドが filePath を保持
3. generate-image 呼び出し時: { date, imageToken, filePath } を送信
4. SNS投稿呼び出し時: { date, text, filePath } を送信
```

全パイプラインで `filePath` を一貫して引き回すことで、`diaries/` 固定パスへの依存を解消する。

### index.html / app.js の拡張

- 日記一覧に加え、リサーチ一覧タブを追加
- GitHub Contents APIで `research/` ディレクトリを走査
- カテゴリバッジを表示

---

## 7. 実装フェーズ

### Phase 6A: リサーチ作成API（MVP）

| # | タスク | 見積もり |
|---|--------|---------|
| 1 | `api/create-research.js` 実装 | 2h |
| 2 | `tests/create-research.test.js` テスト作成 | 2h |
| 3 | `api/generate-image.js` に `filePath` パラメータ対応追加 | 30min |
| 4 | `vercel.json` にルート追加 | 5min |
| 5 | テスト実行・修正 | 1h |

### Phase 6B: フロントエンド対応

| # | タスク | 見積もり |
|---|--------|---------|
| 5 | `docs/diary-input.html` にモード切替UI追加 | 1.5h |
| 6 | リサーチモード送信ロジック実装 | 1h |
| 7 | `docs/app.js` にリサーチ一覧表示追加 | 1.5h |
| 8 | `docs/index.html` にリサーチタブ追加 | 30min |

### Phase 6C: SNS連携拡張

| # | タスク | 見積もり |
|---|--------|---------|
| 9 | `api/post-instagram.js` に `filePath` パラメータ追加 | 30min |
| 10 | `api/post-bluesky.js` に `filePath` パラメータ追加 | 30min |
| 11 | `api/post-threads.js` に `filePath` パラメータ追加 | 30min |
| 12 | 既存SNSテスト更新（filePath対応テスト追加） | 1.5h |
| 13 | フロントエンドSNS投稿テキスト生成（リサーチ用） | 1h |

### Phase 6D: ドキュメント・レビュー

| # | タスク | 見積もり |
|---|--------|---------|
| 14 | `CLAUDE.md` 更新 | 30min |
| 15 | `TECHNICAL_SPEC.md` 更新 | 30min |
| 16 | codex-review 実施・収束 | 1h |

**合計見積もり**: 約14時間

---

## 8. テスト計画

### 新規テストファイル: `tests/create-research.test.js`

**テストカテゴリ（推定40-50テスト）**:

1. **CORS・HTTPメソッド検証** (3テスト)
   - OPTIONSプリフライト、GET拒否、POST受理

2. **JWT認証** (4テスト)
   - 有効JWT、無効JWT、期限切れJWT、AUTH_TOKENフォールバック

3. **入力バリデーション** (8テスト)
   - rawText必須・型・長さ、category検証（有効値/無効値）、topic長さ

4. **環境変数チェック** (2テスト)
   - 必須環境変数未設定時のfail-closed

5. **Upstash Redisレート制限** (5テスト)
   - 正常カウント、上限超過429、Redis障害時500、TTL設定

6. **Claude API連携** (5テスト)
   - 正常レスポンス、APIエラー、JSON抽出失敗、スキーマ検証失敗

7. **LLM出力スキーマ検証** (8テスト)
   - 各フィールドの型・長さ・フォーマット検証

8. **GitHub API保存** (4テスト)
   - 新規作成、既存上書き（SHA取得）、APIエラー

9. **imageToken生成** (2テスト)
   - 正常発行、IMAGE_TOKEN_SECRET未設定時null

10. **slug生成・検証** (3テスト)
    - 有効slug、不正slug拒否、長すぎるslug

11. **filePath統合テスト** (3テスト)
    - research/パスでgenerate-imageが正しくimage_promptを取得
    - research/パスでSNS投稿APIが正しいファイルを参照
    - filePath未指定時にdiaries/へのフォールバック動作

### 既存テスト更新

各SNSテストファイルに `filePath` パラメータ対応テストを追加（各3-4テスト）:
- `tests/post-instagram.test.js`: +3テスト
- `tests/post-bluesky.test.js`: +3テスト
- `tests/post-threads.test.js`: +3テスト

---

## 9. セキュリティ考慮事項

### filePath パラメータのパストラバーサル防止

```javascript
// filePath検証
if (filePath !== undefined) {
  if (typeof filePath !== 'string') {
    return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
  }
  // 許可パターン: diaries/ または research/ 配下のみ
  if (!/^(diaries|research)\/\d{4}\/\d{2}\/[\w-]+\.md$/.test(filePath)) {
    return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
  }
  // ディレクトリトラバーサル防止
  if (filePath.includes('..') || filePath.includes('//')) {
    return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
  }
}
```

### 冪等性キー設計

リサーチは同日に複数投稿がありえるため、`filePath` のハッシュをキーに含める:
```javascript
const idempotencyId = filePath
  ? crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16)
  : date;
const postedKey = `bs_posted:${idempotencyId}`;
const lockKey = `bs_lock:${idempotencyId}`;
```

---

## 10. リスクと依存関係

### リスク

| リスク | 影響度 | 対策 |
|--------|-------|------|
| Claude APIのリサーチ整形品質 | 中 | プロンプトの反復改善、出力例の指定 |
| slug重複（同日同トピック） | 低 | GitHub APIのSHA取得で上書き対応 |
| LLMがslugを不正な形式で生成 | 中 | 正規表現バリデーション + エラー時デフォルトslug生成 |
| SNS投稿テキストの文字数超過 | 低 | フロントエンドでtruncate（既存パターン流用） |

### 依存関係

| 依存 | 状態 | 備考 |
|------|------|------|
| JWT認証 | 完了 | api/lib/jwt.js |
| Upstash Redis | 完了 | 既存パターン流用 |
| Claude API | 完了 | 新プロンプト設計が必要 |
| DALL-E 3 画像生成 | 完了 | generate-image.jsにfilePath対応追加が必要 |
| SNS投稿API | 完了 | filePath対応の最小拡張 |
| sharp（Bluesky画像圧縮） | 完了 | 変更不要 |

### 新規環境変数

なし（既存の環境変数をすべて流用）

---

## 完了基準

- [ ] api/create-research.js 実装・テスト通過
- [ ] research/ ディレクトリへのMarkdown保存動作確認
- [ ] docs/diary-input.html にモード切替UI追加
- [ ] SNS投稿API filePath対応
- [ ] 冪等性キーのリサーチ対応
- [ ] 全テスト通過（既存168 + 新規約50テスト）
- [ ] codex-review ok: true
- [ ] Vercelデプロイ成功
- [ ] 本番でリサーチ投稿→SNS投稿の動作確認
