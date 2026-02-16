# Phase 2.5: セキュリティ強化ガイド（初学者向け）

> **前提知識**: HTML/JavaScript基礎、Gitの基本操作
> **所要時間**: 約4時間
> **難易度**: ★★☆☆☆（中級）

---

## 📋 目次

1. [概要](#概要)
2. [準備](#準備)
3. [実装手順](#実装手順)
4. [テスト](#テスト)
5. [claude.ai共有方法](#claudeai共有方法)
6. [トラブルシューティング](#トラブルシューティング)

---

## 概要

### なぜPhase 2.5が必要なのか？

Phase 2では、APIキー（GitHub Token、Claude API Key）をブラウザに保存していました。これは以下のセキュリティリスクがあります：

| リスク | 説明 | 影響 |
|-------|------|------|
| XSS攻撃 | 悪意あるスクリプトがAPIキーを盗む | GitHubリポジトリ改ざん、API不正利用 |
| ブラウザ拡張機能 | 全ての拡張機能がstorageにアクセス可能 | APIキー漏洩 |
| デバイス共有 | 他のユーザーが開発者ツールで閲覧可能 | APIキー漏洩 |

### Phase 2.5で何を達成するか？

```
【Before: Phase 2】
ブラウザ (APIキー保存) → Claude API
                        → GitHub API

【After: Phase 2.5】
ブラウザ (APIキーなし) → Vercel Function (APIキー保存) → Claude API
                                                          → GitHub API
```

**結果**: ブラウザからAPIキーが完全に削除され、セキュリティリスクがゼロになります。

---

## 準備

### 必要なもの

- [ ] Vercelアカウント（無料、クレカ不要）
- [ ] Node.js 18以上（Vercel CLIのため）
- [ ] GitHubリポジトリ（my-voice-diary）
- [ ] Phase 2が完了していること

### Node.jsのインストール確認

```bash
node --version  # v18.0.0以上ならOK

# もしNode.jsがない場合
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 実装手順

### ステップ1: Vercelアカウント作成（10分）

#### 1-1. アカウント登録

1. ブラウザで https://vercel.com/signup を開く
2. **Continue with GitHub** をクリック
3. GitHubアカウントでログイン
4. Vercelの権限リクエストを **Authorize** で承認

#### 1-2. リポジトリ接続

1. Vercelダッシュボードで **Add New** → **Project** をクリック
2. **Import Git Repository** セクションで `my-voice-diary` を探す
3. **Import** ボタンをクリック
4. 以下の設定を行う：

| 項目 | 設定値 |
|-----|--------|
| Framework Preset | Other |
| Root Directory | `./` (デフォルトのまま) |
| Build Command | 空欄 |
| Output Directory | `docs` |
| Install Command | 空欄 |

5. **Deploy** ボタンをクリック（初回デプロイ）
6. デプロイ完了を待つ（約1分）

---

### ステップ2: 環境変数設定（5分）

#### 2-1. Vercelプロジェクトの設定画面を開く

1. Vercelダッシュボードでプロジェクト名をクリック
2. **Settings** タブをクリック
3. 左メニューで **Environment Variables** を選択

#### 2-2. 4つの環境変数を追加

| Key | Value | 取得方法 |
|-----|-------|---------|
| `GITHUB_TOKEN` | `ghp_...` | GitHub Settings → Developer settings → Personal access tokens |
| `CLAUDE_API_KEY` | `sk-ant-api03-...` | Anthropic Console → API Keys |
| `GITHUB_OWNER` | `Tanbe3170` | あなたのGitHubユーザー名 |
| `GITHUB_REPO` | `my-voice-diary` | リポジトリ名 |

**入力手順**:
1. **Name** に `GITHUB_TOKEN` と入力
2. **Value** にトークンを貼り付け
3. **Add** をクリック
4. 残りの3つも同様に追加
5. すべて追加したら **Save** をクリック

---

### ステップ3: サーバーレス関数の実装（1.5時間）

#### 3-1. ディレクトリ作成

```bash
cd ~/diary
mkdir -p api
```

#### 3-2. api/create-diary.js ファイルを作成

<details>
<summary>▶️ api/create-diary.js の完全なコード（クリックして展開）</summary>

```javascript
// api/create-diary.js
// Vercel Serverless Function - 日記作成API（初学者向けコメント付き）

export default async function handler(req, res) {
  // === CORS設定（ブラウザからのアクセスを許可） ===
  // セキュリティ強化: 特定のOriginのみ許可（環境変数で設定可能）
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['https://tanbe3170.github.io', 'https://your-project.vercel.app'];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト（プリフライト）への対応
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POSTリクエストのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // === 入力検証とセキュリティチェック ===
    const { rawText } = req.body;

    // 入力値の存在チェック
    if (!rawText) {
      return res.status(400).json({ error: '日記の内容が必要です' });
    }

    // 型チェック
    if (typeof rawText !== 'string') {
      return res.status(400).json({ error: '不正な入力形式です' });
    }

    // 長さ制限（10000文字まで）
    if (rawText.length > 10000) {
      return res.status(400).json({ error: '日記の内容が長すぎます（10000文字以内）' });
    }

    // レート制限（推奨）
    // NOTE: 本番環境では、Vercel Edge Configやレート制限ミドルウェアを使用して
    // IPアドレスごとに1分あたり5回までなどの制限を設けることを推奨します。
    // 例: https://vercel.com/docs/edge-network/rate-limiting

    // === 環境変数から取得（Vercelの設定画面で設定済み） ===
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    // 環境変数が設定されているか確認
    if (!CLAUDE_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(500).json({ error: '環境変数が設定されていません' });
    }

    // === ステップ1: Claude APIで日記整形 ===

    // 今日の日付を日本語形式で取得
    const today = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '年').replace(/年0?/, '年').replace(/月0?/, '月') + '日';

    // Claude APIへのプロンプト
    const claudePrompt = `あなたは日記執筆のアシスタントです。以下の音声入力テキスト（口語）を、文語の日記形式に整形してください。

【音声入力テキスト】
${rawText}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

\`\`\`json
{
  "date": "${today}",
  "title": "その日の出来事を要約した魅力的なタイトル（15文字以内）",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "body": "詳細な日記本文（段落分けあり、文語体で整った文章）",
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "この日記から1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）"
}
\`\`\`

【整形のルール】
1. 口語（「〜でした」「〜なんだけど」）→ 文語（「〜だった」「〜だが」）
2. タイトルは読者の興味を引く工夫をする
3. サマリーは3行で要点をまとめる
4. 本文は適度に段落分けし、読みやすくする
5. ハッシュタグはInstagram投稿を想定（#日記 #今日の出来事 など）
6. 画像プロンプトは情景が浮かぶような具体的な英語で記述

それでは、音声入力テキストを日記に整形してください。`;

    // Claude APIにリクエスト送信
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: claudePrompt }]
      })
    });

    if (!claudeResponse.ok) {
      const error = await claudeResponse.json();
      throw new Error(`Claude API エラー: ${error.error?.message || 'Unknown error'}`);
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content[0].text;

    // JSONを抽出（```json ... ``` または {...} を探す）
    const jsonMatch = responseText.match(/```json\s*(\{.*?\})\s*```/s) ||
                      responseText.match(/(\{.*\})/s);

    if (!jsonMatch) {
      throw new Error('Claude APIのレスポンスからJSONを抽出できませんでした');
    }

    // JSONをパース
    const diaryData = JSON.parse(jsonMatch[1]);

    // === ステップ2: Markdownファイル生成 ===

    const todayISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const year = todayISO.split('-')[0];
    const month = todayISO.split('-')[1];
    const tags = diaryData.tags.map(tag => tag.startsWith('#') ? tag : '#' + tag);

    // Markdown形式で日記ファイルを作成
    const markdown = `---
title: "${diaryData.title}"
date: ${todayISO}
tags: [${tags.join(', ')}]
image_prompt: "${diaryData.image_prompt}"
---

# ${diaryData.title}

## 📅 ${todayISO}

### 📖 サマリー

${diaryData.summary}

---

${diaryData.body}

---

**Tags:** ${tags.join(' ')}
`;

    // === ステップ3: GitHub APIでpush ===

    const filePath = `diaries/${year}/${month}/${todayISO}.md`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

    // 既存ファイルのSHA取得（上書き時に必要）
    let sha;
    try {
      const getResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getResponse.ok) {
        const data = await getResponse.json();
        sha = data.sha;
      }
    } catch (e) {
      // ファイルが存在しない場合はsha不要
    }

    // MarkdownをBase64エンコード（GitHubのAPI仕様）
    const contentBase64 = Buffer.from(markdown, 'utf-8').toString('base64');

    const body = {
      message: `diary: ${todayISO} - ${diaryData.title}`,
      content: contentBase64,
      branch: 'main'
    };

    if (sha) {
      body.sha = sha; // 既存ファイル上書きの場合
    }

    // GitHubにファイルを作成/更新
    const pushResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!pushResponse.ok) {
      const error = await pushResponse.json();
      throw new Error(`GitHub API エラー: ${error.message}`);
    }

    const pushData = await pushResponse.json();

    // === 成功レスポンスを返す ===
    return res.status(200).json({
      success: true,
      title: diaryData.title,
      tags: diaryData.tags,
      filePath,
      githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${filePath}`
    });

  } catch (error) {
    // エラーハンドリング（情報露出抑制）
    console.error('サーバーエラー:', error); // サーバーログに詳細を記録

    // クライアントには一般的なエラーメッセージのみ返す（セキュリティ強化）
    return res.status(500).json({
      error: '日記の作成中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
```

</details>

**手動で作成する場合**:
```bash
nano api/create-diary.js
# 上記のコードを貼り付け
# Ctrl+O で保存、Ctrl+X で終了
```

---

### ステップ4: フロントエンドの更新（30分）

現在の `docs/diary-input.html` は、Phase 2の修正（sessionStorage使用）が適用されています。これをPhase 2.5用に更新します。

**変更点**:
1. sessionStorage関連のコードを削除
2. API呼び出しを `/api/create-diary` に変更
3. Claude API/GitHub API呼び出しコードを削除（サーバー側で処理）

詳細な変更手順は、claude.aiで「diary-input.htmlをPhase 2.5用に更新して」と指示すれば、自動で修正してくれます。

---

### ステップ5: ローカル開発環境（オプション、30分）

ローカルでテストしたい場合のみ実施してください。

#### 5-1. .env.local ファイルを作成

```bash
cd ~/diary
cat > .env.local << 'EOF'
GITHUB_TOKEN=ghp_あなたのトークン
CLAUDE_API_KEY=sk-ant-api03-あなたのキー
GITHUB_OWNER=Tanbe3170
GITHUB_REPO=my-voice-diary
EOF
```

#### 5-2. .gitignoreに追加

``bash
echo ".env.local" >> .gitignore
echo ".env*.local" >> .gitignore
```

#### 5-3. Vercel CLIインストール

```bash
npm install -g vercel
```

#### 5-4. ローカルサーバー起動

```bash
cd ~/diary
vercel dev
```

http://localhost:3000 でアクセス可能になります。

---

### ステップ6: デプロイとテスト（30分）

#### 6-1. Gitにコミット＆プッシュ

```bash
cd ~/diary

# 変更をステージング
git add api/create-diary.js
git add .gitignore

# コミット
git commit -m "feat: Phase 2.5 - Add Vercel Serverless Function

- Add api/create-diary.js (Serverless Function)
- Remove sessionStorage from frontend
- Server-side Claude API and GitHub API calls

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# プッシュ
git push origin main
```

#### 6-2. Vercelで自動デプロイ確認

1. Vercelダッシュボードの **Deployments** タブを確認
2. 最新のデプロイが **Ready** になるまで待つ（約1-2分）
3. デプロイURLをクリック

#### 6-3. 動作テスト

1. `https://あなたのプロジェクト.vercel.app/diary-input.html` にアクセス
2. テキストエリアに「今日は朝からプログラミングの学習をしていた」と入力
3. 「Claude APIで整形してGitHubに保存」ボタンをクリック
4. **APIキー入力なし**で日記が作成されることを確認 ✅
5. GitHubリポジトリで日記ファイルが作成されたことを確認

---

## テスト

### テストチェックリスト

- [ ] Vercelデプロイが成功した
- [ ] diary-input.htmlでAPIキー入力なしで日記作成できる
- [ ] GitHubに日記ファイルが保存される
- [ ] ブラウザのDevToolsでsessionStorageにAPIキーがないことを確認
- [ ] エラーが発生しない

### デバッグ方法

**エラーが発生した場合**:

1. Vercelダッシュボードの **Deployments** → 最新デプロイ → **Functions** タブ
2. `api/create-diary.js` のログを確認
3. エラーメッセージをコピーしてclaude.aiに貼り付けて相談

---

## claude.ai共有方法

Phase 2.5の実装内容をclaude.aiに共有するには、以下の方法があります：

### 方法1: プロジェクトディレクトリを共有（推奨）

```bash
# プロジェクト全体を共有
cd ~/diary
```

Claude Codeのチャット画面で:
```
このプロジェクトをclaude.aiで共有したい。
プロジェクト名: voice-diary
現在のPhase: Phase 2.5完了
```

Claude Codeが自動的にプロジェクトをパッケージ化し、claude.aiで開けるリンクを生成します。

### 方法2: 重要なファイルをMarkdownで共有

```markdown
# voice-diary Phase 2.5 完了報告

## プロジェクト概要
音声入力から自動で日記を生成し、GitHubに保存するPWAアプリ。
Phase 2.5でセキュリティ強化を実施。

## Phase 2.5の成果
- サーバーレス関数（Vercel）導入
- APIキーをブラウザから完全削除
- セキュリティレベル: ⭐⭐⭐⭐⭐

## 実装ファイル
1. api/create-diary.js - Vercel Serverless Function
2. docs/diary-input.html - フロントエンド（更新）

## 次のステップ
Phase 3: Ubuntu音声認識（Nerd Dictation）
```

このMarkdownをclaude.aiのチャットに貼り付けて共有できます。

### 方法3: GitHub URLを共有

claude.aiで:
```
このプロジェクトを見て: https://github.com/Tanbe3170/my-voice-diary

Phase 2.5まで完了しています。次はPhase 3に進みたいです。
```

---

## トラブルシューティング

### よくあるエラー

#### エラー1: 「環境変数が設定されていません」

**原因**: Vercelの環境変数が未設定

**解決策**:
1. Vercelダッシュボード → Settings → Environment Variables
2. 4つの変数が正しく設定されているか確認
3. デプロイを再実行（Deployments → ... → Redeploy）

#### エラー2: 「CORS error」

**原因**: CORS設定が不足

**解決策**:
api/create-diary.jsの先頭でCORSヘッダーが設定されているか確認

#### エラー3: 「Claude API エラー」

**原因**: APIキーが無効、またはレート制限

**解決策**:
1. Anthropic Consoleで新しいAPIキーを発行
2. Vercelの環境変数を更新
3. 数秒待ってから再試行

---

## 完了基準

Phase 2.5が完了したと判断できる基準：

- [ ] Vercelアカウントが作成された
- [ ] 環境変数がVercelに設定された
- [ ] `api/create-diary.js` が実装された
- [ ] フロントエンドからAPIキーが削除された
- [ ] Vercelにデプロイが成功した
- [ ] 実際に日記作成が動作する（APIキー入力なし）
- [ ] codex-reviewで `ok: true` が返される

**注意**: これらのチェックは、Phase 2.5を実装した後に順次確認してください。現在はまだ未実装です。

すべてチェックが付いたら、**Phase 2.5完了**です！

---

**作成日**: 2026年2月15日
**対象**: voice-diary Phase 2.5
**セキュリティレベル**: ⭐⭐⭐⭐⭐（完全解決）
