# 🎤 My Voice Diary

音声入力で書く毎日の日記システム

## 📖 概要

このプロジェクトは、音声入力から自動で日記を生成し、GitHubに保存、GitHub Pagesで閲覧できるシステムです。

**パイプライン:**
```
音声入力 → Claude API整形（タイトル/サマリー/本文/ハッシュタグ） 
→ GitHub保存（Markdown） → GitHub Pages閲覧 → Instagram投稿準備
```

## 📁 ディレクトリ構成

```
voice-diary-project/
├── diaries/          # 日記ファイル（YYYY/MM/YYYY-MM-DD.md）
├── images/           # AI生成画像
├── scripts/          # 自動化スクリプト
│   ├── diary-summarize.py      # Claude APIで日記整形
│   ├── diary-push.sh           # GitHubに自動push
│   ├── image-prompt-gen.py     # 画像生成プロンプト作成
│   └── nerd-dictation-setup.sh # Nerd Dictationインストール
└── docs/             # GitHub Pages用静的サイト
```

## 🚀 使い方

### 1. 音声入力から日記作成

```bash
# 音声入力テキストを整形
python3 scripts/diary-summarize.py "今日の出来事をここに入力..."

# GitHubに保存
bash scripts/diary-push.sh "今日の出来事をここに入力..."
```

### 2. Ubuntu での音声認識（Nerd Dictation）

```bash
# セットアップ（初回のみ）
bash scripts/nerd-dictation-setup.sh

# 音声認識開始
nerd-dictation begin --vosk-model-dir=~/vosk-model-ja-0.22 &

# 音声認識終了
nerd-dictation end
```

## 📝 開発フェーズ

- [x] **Phase 1**: 基本機能（音声→整形→GitHub保存）
- [ ] **Phase 2**: GitHub Pages閲覧機能
- [ ] **Phase 3**: AI画像生成
- [ ] **Phase 4**: Instagram自動投稿

## 🔧 環境構築

### 必要な環境変数

`~/.bashrc` に以下を追加：

```bash
# Claude API
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# GitHub
export GITHUB_TOKEN="ghp_..."
```

### Python依存関係

```bash
# 仮想環境作成（初回のみ）
python3 -m venv ~/diary-env

# 仮想環境有効化
source ~/diary-env/bin/activate

# パッケージインストール
pip install anthropic pyyaml requests
```

## 📚 参考資料

- [Claude API Documentation](https://docs.anthropic.com/)
- [Nerd Dictation](https://github.com/ideasman42/nerd-dictation)
- [GitHub Pages](https://pages.github.com/)

## 📄 ライセンス

MIT License
