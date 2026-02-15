# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## プロジェクト概要

**voice-diary** - 音声入力から自動で日記を生成し、GitHubに保存、GitHub Pagesで閲覧できるシステム

**主要な技術スタック:**
- Python 3.12.3 (仮想環境: `~/diary-env`)
- Claude API (Anthropic) - 日記整形
- GitHub API - ファイル保存
- GitHub Pages - 静的サイトホスティング
- Web Speech API - ブラウザ音声認識

**開発フェーズ:**
- Phase 1: 基本機能（✅ 完了）
- Phase 2: Webインターフェース（✅ 完了 - セキュリティ修正済み）
- Phase 2.5: セキュリティ強化（📅 計画中 - Vercel Serverless Function導入）
- Phase 3-5: 音声認識、画像生成、Instagram投稿（📅 未着手）

**最新の変更（2026-02-15）:**
- Phase 2のcodex-review完了（ok: true）
- XSS脆弱性修正（innerHTML → DOM構築）
- localStorage → sessionStorage移行（暫定対策）
- Phase 2.5の実装計画追加（PHASE_2.5_GUIDE.md）

---

## コミュニケーション設定

**言語:** すべての応答を日本語で行う
- コードの説明、エラーメッセージ、提案も日本語
- 思考プロセスや実行時の説明も日本語

**コーディング規約:**
- 変数名・関数名: 英語（スネークケース） - 例: `diary_text`, `create_diary()`
- ファイル名: 英語（ハイフン区切り） - 例: `diary-push.sh`, `image-gen.py`
- コメント: 日本語
- コミットメッセージ: 日本語OK、フォーマット: `<タイプ>: <説明>`

---

## 主要コマンド

### 日記作成（Phase 1 - 手動テキスト入力）

```bash
# ディレクトリ移動
cd ~/diary

# 仮想環境有効化（初回のみ）
source ~/diary-env/bin/activate

# 日記作成（Claude API整形 + GitHub自動保存）
bash scripts/diary-push.sh "今日の出来事をここに入力..."

# 日記整形のみ（JSON出力）
python3 scripts/diary-summarize.py "今日の出来事をここに入力..."
```

### 環境確認

```bash
# Python仮想環境の確認
which python3  # ~/diary-env/bin/python3 と表示されればOK

# 環境変数の確認
echo $ANTHROPIC_API_KEY  # sk-ant-api03-... と表示されればOK
echo $GITHUB_TOKEN       # ghp_... と表示されればOK

# 依存パッケージの確認
pip list  # anthropic, pyyaml, requests が表示される

# 最新の日記を確認
cat diaries/$(date +%Y/%m/%Y-%m-%d).md
```

### Webアプリの確認（Phase 2）

```bash
# ローカルでブラウザプレビュー
start docs/index.html       # メインページ
start docs/diary-input.html # 音声入力フォーム

# GitHub Pagesで確認
# https://tanbe3170.github.io/my-voice-diary/
# https://tanbe3170.github.io/my-voice-diary/diary-input.html
```

### Git操作

```bash
# 現在の状態確認
git status

# 最新のコミット確認
git log --oneline -5

# リモートと同期
git pull origin main
git push origin main
```

---

## アーキテクチャ

### システム全体のデータフロー

```
[入力] 音声/テキスト
  ↓
[整形] scripts/diary-summarize.py
  - Claude API呼び出し
  - 口語 → 文語変換
  - タイトル、サマリー、本文、ハッシュタグ、画像プロンプト生成
  ↓
[保存] scripts/diary-push.sh
  - Markdown生成（YAML Front Matter）
  - ファイル作成（diaries/YYYY/MM/YYYY-MM-DD.md）
  - Git commit + push
  ↓
[閲覧] GitHub Pages (docs/)
  - index.html: 日記一覧
  - diary-input.html: 音声入力フォーム
  - style.css: レスポンシブデザイン
```

### ディレクトリ構造

```
voice-diary/
├── scripts/                 # 自動化スクリプト
│   ├── diary-summarize.py  # Claude APIで日記整形
│   └── diary-push.sh       # GitHubに自動push
│
├── diaries/                # 日記ファイル（Markdown）
│   └── YYYY/MM/YYYY-MM-DD.md
│
├── docs/                   # GitHub Pages（静的サイト）
│   ├── index.html          # 日記一覧ページ
│   ├── diary-input.html    # 音声入力フォーム
│   └── style.css           # レスポンシブCSS
│
├── IMPLEMENTATION_PLAN.md  # 詳細実装計画（全Phase）
├── TECHNICAL_SPEC.md       # 技術仕様書
├── PROJECT_OVERVIEW.md     # プロジェクト概要
└── SETUP.md                # セットアップ手順
```

### 日記ファイルのフォーマット

すべての日記は以下のMarkdown形式で保存される：

```markdown
---
title: "日記のタイトル"
date: YYYY-MM-DD
tags: [#タグ1, #タグ2, #タグ3]
image_prompt: "AI画像生成用の英語プロンプト"
---

# 日記のタイトル

## 📅 YYYY-MM-DD

### 📖 サマリー

3行でまとめた要約

---

詳細な本文（段落分け）

---

**Tags:** #タグ1 #タグ2 #タグ3
```

---

## 重要な実装パターン

### Claude API使用パターン

**ファイル:** `scripts/diary-summarize.py`

```python
# 1. プロンプト構築（口語→文語変換の指示）
prompt = f"""あなたは日記執筆のアシスタントです。
以下の音声入力テキスト（口語）を、文語の日記形式に整形してください。

【音声入力テキスト】
{raw_text}

【出力形式】JSON形式で以下を出力:
{{
  "title": "タイトル（15文字以内）",
  "summary": "3行サマリー",
  "body": "詳細な本文",
  "tags": ["ハッシュタグ"],
  "image_prompt": "画像生成用英語プロンプト"
}}
"""

# 2. Claude API呼び出し
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=2000,
    messages=[{"role": "user", "content": prompt}]
)

# 3. レスポンスからJSON抽出
response_text = response.content[0].text
diary_data = json.loads(json_match.group(1))
```

### GitHub API使用パターン

**ブラウザ版（diary-input.html）:**

```javascript
// GitHub Contents APIでファイル作成
const apiUrl = `https://api.github.com/repos/Tanbe3170/my-voice-diary/contents/${filePath}`;

const response = await fetch(apiUrl, {
  method: 'PUT',
  headers: {
    'Authorization': `token ${githubToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: `diary: ${date} - ${title}`,
    content: btoa(unescape(encodeURIComponent(markdown))), // Base64エンコード
    branch: 'main'
  })
});
```

### Web Speech API使用パターン

**ファイル:** `docs/diary-input.html`

```javascript
// 音声認識の初期化（日本語、継続録音、中間結果表示）
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'ja-JP';
recognition.continuous = true;
recognition.interimResults = true;

// 認識結果の処理
recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    if (event.results[i].isFinal) {
      diaryText.value += transcript + ' ';
    }
  }
};
```

---

## 環境構築

### 必須の環境変数

`~/.bashrc` に以下を追加：

```bash
# Claude API
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# GitHub
export GITHUB_TOKEN="ghp_..."

# (Phase 4以降で追加)
# export OPENAI_API_KEY="sk-..."
# export INSTAGRAM_ACCESS_TOKEN="..."
```

反映: `source ~/.bashrc`

### Python仮想環境

```bash
# 仮想環境の場所
~/diary-env/

# 有効化
source ~/diary-env/bin/activate

# 必須パッケージ
pip install anthropic pyyaml requests
```

### GitHubリポジトリ設定

- リポジトリ名: `my-voice-diary`
- GitHub Pages: `/docs` ディレクトリから公開
- URL: https://tanbe3170.github.io/my-voice-diary/

---

## プロジェクト固有のルール

### diary-push.sh の実行ルール

- **必ずユーザーに確認を取ってから実行**
- GitHubへのpush前に内容をプレビュー表示
- エラー時は日本語でわかりやすく説明

### 画像生成（Phase 4）

- DALL-E 3使用時はコストを事前に通知（$0.04/枚）
- 画像生成は任意（ユーザーの確認後）

### Instagram投稿（Phase 5）

- 投稿前に必ずプレビュー表示
- ユーザーの明示的な承認が必要

---

## 開発フロー

1. **機能追加前**: 必ず日本語で説明
2. **コード変更後**: 動作確認
3. **エラー発生時**: 日本語でわかりやすく説明
4. **完了時**: 実行結果を日本語で報告

---

## トラブルシューティング

### よくあるエラー

**1. `ANTHROPIC_API_KEY` が見つからない**
```bash
# 確認
echo $ANTHROPIC_API_KEY

# 未設定の場合
echo 'export ANTHROPIC_API_KEY="sk-ant-api03-..."' >> ~/.bashrc
source ~/.bashrc
```

**2. Python仮想環境が有効化されていない**
```bash
# 現在のPythonパス確認
which python3

# 仮想環境有効化
source ~/diary-env/bin/activate
```

**3. GitHubへのpushが失敗**
```bash
# 認証確認
git config --global user.name
git config --global user.email

# SSH鍵確認
ssh -T git@github.com
```

**4. Claude APIのレート制限**
- エラーメッセージ: `rate_limit_error`
- 対策: 数秒待ってから再実行

---

## 参考ドキュメント

- **詳細実装計画**: `IMPLEMENTATION_PLAN.md` - 全Phaseの実装手順
- **技術仕様**: `TECHNICAL_SPEC.md` - API仕様、プロンプト設計
- **セットアップ**: `SETUP.md` - 環境構築の詳細手順
- **プロジェクト概要**: `PROJECT_OVERVIEW.md` - 開発の背景、目標

---

*最終更新: 2026年2月13日*
*現在のフェーズ: Phase 2（Webインターフェース構築中）*
# Plan Creation

Whenever you create a markdown file in the ./plans directory, please make sure to have it reviewed by Codex using the codex-review skill.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

# Review gate (codex-review)
At key milestones—after updating specs/plans, after major implementation steps (≥5 files / public API / infra-config), and before commit/PR/release—run the codex-review SKILL and iterate review→fix→re-review until clean.

# Task Management

When implementing features or making code changes, use the Tasks feature to manage and track progress. Break down the work into clear steps and update task status as you proceed.

# Other

When asking for a decision, use "AskUserQuestion".
