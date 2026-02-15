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
### Phase 1完成後の使い方

#### 方法1: 手動テキスト入力（現在利用可能）
```bash
cd ~/diary
bash scripts/diary-push.sh "今日の出来事をここに入力..."
```

#### 方法2: スマホから音声入力（Phase 2完成後）

1. https://tanbe3170.github.io/my-voice-diary/diary-input.html にアクセス
2. 🎤 ボタンをタップして音声入力
3. 「保存」ボタンをタップ

#### 方法3: Ubuntu PC音声入力（Phase 3完成後）
```bash
# 音声入力モード起動
diary-voice

# 話す → Enter → 日記が自動保存される
```

#### オプション: AI画像生成（Phase 4完成後）
```bash
# 日記作成時に画像生成を選択
bash scripts/diary-push.sh "今日の出来事..."
# → "画像を生成しますか？ (y/n):" で y を入力
```

#### オプション: Instagram自動投稿（Phase 5完成後）
```bash
# 日記作成時にInstagram投稿を選択
bash scripts/diary-push.sh "今日の出来事..."
# → "Instagramに投稿しますか？ (y/n):" で y を入力
```

## 📝 開発フェーズ

- [x] **Phase 1**: 基本機能（音声→整形→GitHub保存）
- [ ] **Phase 2**: GitHub Pages閲覧機能
- [ ] **Phase 3**: AI画像生成
- [ ] **Phase 4**: Instagram自動投稿

---

## 🎤 音声入力機能

### Phase 2: スマホから音声入力
- **SuperWhisper**: 高精度音声認識アプリ（iOS/Android）
- **Web Speech API**: ブラウザ標準機能（無料、Chrome/Safari対応）
- **Webフォーム**: PWA対応、オフライン動作可能
- **アクセス**: https://tanbe3170.github.io/my-voice-diary/diary-input.html

### Phase 3: Ubuntu PC音声入力
- **Nerd Dictation + Vosk**: オフライン動作
- **日本語モデル**: vosk-model-small-ja-0.22（約50MB）
- **コマンド**: `diary-voice`（音声入力モード起動）
- **コスト**: $0

---

## 🖼️ AI画像生成（Phase 4）

### 機能
- **DALL-E 3 API**: 日記の内容から自動で画像生成
- **画像プロンプト自動作成**: Claude APIが日記から最適なプロンプトを生成
- **保存先**: `images/YYYY-MM-DD.png`
- **Markdown自動更新**: 生成した画像を日記に自動埋め込み

### コスト
- **Standard品質**: $0.04/枚
- **HD品質**: $0.08/枚
- **月30枚**: 約$1.2/月

---

## 📱 Instagram自動投稿（Phase 5）

### 機能
- **Instagram Graph API**: 画像＋キャプション自動投稿
- **ハッシュタグ自動付与**: 日記のタグから自動生成
- **完全自動化**: `diary-push.sh` から直接投稿可能

### 前提条件
- Meta開発者アカウント（無料）
- Instagramビジネスアカウント（無料）
- Facebookページ（無料）

### コスト
- **API使用料**: $0

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
- [Vercel Serverless Functions](https://vercel.com/docs/functions)

---

## 🚧 開発状況

### ✅ Phase 1: 基本機能（完了）
- Python環境構築
- Claude API連携
- GitHub自動保存
- 日記整形機能

### ✅ Phase 2: Webインターフェース（完了）
- Web Speech API音声入力
- GitHub Pages静的サイト
- PWA対応（manifest.json, service-worker.js）
- **セキュリティ修正**:
  - XSS脆弱性対策（innerHTML → DOM構築）
  - localStorage → sessionStorage移行
  - codex-review: ok ✅

### 📅 Phase 2.5: セキュリティ強化（計画中）
- Vercel Serverless Function導入
- APIキーのブラウザからの完全削除
- サーバー側シークレット管理
- 詳細: [PHASE_2.5_GUIDE.md](PHASE_2.5_GUIDE.md)

### 📅 Phase 3-5: 今後の予定
- Phase 3: Ubuntu音声認識（Nerd Dictation）
- Phase 4: AI画像生成（DALL-E 3）
- Phase 5: Instagram自動投稿

**最終更新**: 2026年2月15日

---

## 📄 ライセンス

MIT License
