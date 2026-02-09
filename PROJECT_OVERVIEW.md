# voice-diary プロジェクト概要

## 📌 プロジェクト基本情報

**プロジェクト名**: voice-diary (音声入力日記システム)  
**開発者**: Minori  
**開発環境**: Ubuntu 22.04 LTS (MacBook Air 2017, 8GB RAM)  
**IDE**: VSCode + Claude拡張機能  
**開始日**: 2025年2月  
**現在のフェーズ**: Phase 1（基本機能実装）

---

## 🎯 プロジェクトの目的

音声入力から自動で日記を生成し、GitHubに保存、GitHub Pagesで閲覧、最終的にInstagramに投稿できるシステムを構築する。

**パイプライン全体像:**
```
[音声入力] 
  ↓
[Claude API で整形] (タイトル/サマリー/本文/ハッシュタグ/画像プロンプト)
  ↓
[GitHub保存] (Markdown形式)
  ↓
[GitHub Pages閲覧] (静的サイト)
  ↓
[AI画像生成] (DALL-E/Midjourney)
  ↓
[Instagram投稿] (自動化)
```

---

## 👤 開発者スキルセット

| 資格・学習状況 | 活用ポイント |
|---------------|-------------|
| Java Bronze 取得済み | プログラミング基礎理解 |
| 基本情報技術者 取得済み | システム設計の基礎知識 |
| Java Silver 8割学習済み | オブジェクト指向の理解 |
| Python 初学者 | スクリプト作成、API連携学習中 |
| Git/GitHub 使用経験あり | 3台のマシンで同期運用中 |

---

## 🛠️ 技術スタック

### コア技術
- **言語**: Python 3.12.3
- **AI API**: Claude API (Anthropic)
- **バージョン管理**: Git + GitHub
- **ホスティング**: GitHub Pages (予定)

### Python環境
- **仮想環境**: `~/diary-env` (venv)
- **主要ライブラリ**:
  - `anthropic 0.79.0` - Claude API クライアント
  - `PyYAML 6.0.3` - 設定ファイル管理
  - `requests 2.32.5` - HTTP通信

### 音声入力
- **スマホ**: SuperWhisper (予定)
- **Ubuntu**: Nerd Dictation + Vosk (日本語モデル)

### 画像生成 (Phase 3)
- DALL-E 3 (OpenAI)
- Midjourney (Discord API経由)

---

## 📁 プロジェクト構造

```
voice-diary/
├── README.md                    # プロジェクト説明
├── SETUP.md                     # 環境構築・実行手順
├── PROJECT_OVERVIEW.md          # プロジェクト概要（本ファイル）
├── IMPLEMENTATION_PLAN.md       # 詳細実装計画
├── TECHNICAL_SPEC.md            # 技術仕様書
├── .gitignore                   # Git除外設定
│
├── scripts/                     # 自動化スクリプト
│   ├── diary-summarize.py       # Claude APIで日記整形
│   ├── diary-push.sh            # GitHubに自動push
│   ├── image-prompt-gen.py      # 画像生成プロンプト作成
│   └── nerd-dictation-setup.sh  # Nerd Dictationセットアップ
│
├── diaries/                     # 日記ファイル (Markdown)
│   └── YYYY/MM/YYYY-MM-DD.md
│
├── images/                      # AI生成画像
│   └── YYYY-MM-DD_*.png
│
├── docs/                        # GitHub Pages用静的サイト
│   ├── index.html
│   ├── style.css
│   └── script.js
│
└── assets/                      # アセットファイル
    ├── diary-input-web.html     # スマホ用入力フォーム
    ├── diary-template.md        # 日記テンプレート
    ├── character-config.yml     # マスコットキャラクター設定
    └── instagram-template.txt   # Instagram投稿テンプレート
```

---

## 📊 開発フェーズ

### ✅ Phase 0: 環境構築（完了）
- [x] Python仮想環境構築 (`~/diary-env`)
- [x] 必要パッケージインストール (anthropic, pyyaml, requests)
- [x] Claude API キー設定 (`~/.bashrc`)
- [x] GitHub Token 設定 (`~/.bashrc`)
- [x] Git SSH設定（3台のマシンで同期可能）

### 🔄 Phase 1: 基本機能（実装中）
**目標**: 音声入力 → Claude API整形 → GitHub保存

**成果物**:
- [x] `diary-summarize.py` - Claude APIで日記整形
- [x] `diary-push.sh` - GitHubに自動push
- [ ] GitHubリポジトリ作成 (`my-voice-diary`)
- [ ] 初回コミット・テスト実行
- [ ] 実環境での動作確認

**現在の状態**: スクリプトファイルは作成済み、実環境での実行待ち

### 📅 Phase 2: GitHub Pages閲覧（未着手）
**目標**: GitHub Pagesで日記を美しく閲覧

**成果物**:
- [ ] 静的サイトのHTML/CSS/JS
- [ ] カレンダービュー
- [ ] タグ検索機能
- [ ] レスポンシブデザイン

### 🎨 Phase 3: AI画像生成（未着手）
**目標**: 日記の内容から自動で画像生成

**成果物**:
- [ ] `image-prompt-gen.py` - 画像生成プロンプト作成
- [ ] DALL-E API連携
- [ ] Midjourney Discord Bot連携
- [ ] 生成画像の自動保存

### 📱 Phase 4: Instagram連携（未着手）
**目標**: Instagram自動投稿

**成果物**:
- [ ] Instagram Graph API連携
- [ ] 投稿テンプレート
- [ ] 自動投稿スクリプト

---

## 🔑 環境変数・APIキー

### 設定場所: `~/.bashrc`

```bash
# Claude API
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# GitHub
export GITHUB_TOKEN="ghp_..."

# (Phase 3以降で追加予定)
# export OPENAI_API_KEY="sk-..."
# export INSTAGRAM_ACCESS_TOKEN="..."
```

### 設定確認コマンド

```bash
# 環境変数が設定されているか確認
echo $ANTHROPIC_API_KEY
echo $GITHUB_TOKEN

# 再読み込み
source ~/.bashrc
```

---

## 🎨 日記フォーマット仕様

### Markdownファイル構造

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
各行30文字程度
改行で区切る

---

詳細な本文

段落分けして読みやすく

---

**Tags:** #タグ1 #タグ2 #タグ3
```

---

## 🔄 ワークフロー

### 日常の使い方（Phase 1完成後）

```bash
# 1. 音声入力テキストを用意
TEXT="今日は朝から..."

# 2. 日記整形 + GitHub保存（ワンコマンド）
bash ~/diary/scripts/diary-push.sh "$TEXT"

# 3. 確認
cat ~/diary/diaries/$(date +%Y/%m/%Y-%m-%d).md
```

### Ubuntu音声認識の使い方（Phase 1拡張）

```bash
# 音声認識開始
nerd-dictation begin --vosk-model-dir=~/vosk-model-ja-0.22 &

# 話す...

# 音声認識終了（クリップボードにテキストが保存される）
nerd-dictation end

# クリップボードから取得して日記保存
bash ~/diary/scripts/diary-push.sh "$(xclip -o)"
```

---

## 🧪 テスト計画

### Phase 1 テストケース

| # | テスト項目 | 入力 | 期待される出力 |
|---|-----------|------|---------------|
| 1 | 日記整形のみ | 口語テキスト | JSON形式の日記データ |
| 2 | GitHub保存 | 口語テキスト | Markdownファイル作成 + push |
| 3 | エラーハンドリング | APIキー未設定 | エラーメッセージ表示 |
| 4 | 日本語処理 | 絵文字・記号含む | 正常に処理される |

---

## 📚 参考資料

### 公式ドキュメント
- [Claude API Documentation](https://docs.anthropic.com/)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Nerd Dictation](https://github.com/ideasman42/nerd-dictation)
- [Vosk Speech Recognition](https://alphacephei.com/vosk/)

### 関連プロジェクト
- **Owl Encyclopedia** (`~/workspace/owl-encyclopedia/owl-api/`)
  - Spring Boot + React のフルスタック開発
  - Week 1 Days 1-4 完了済み
  - voice-diaryとは完全独立

---

## 🐛 既知の問題・制約事項

### 現在の制約
1. **APIレート制限**: Claude API（詳細は要確認）
2. **GitHub無料枠**: プライベートリポジトリの制限
3. **Ubuntu音声認識精度**: Vosk日本語モデルの精度に依存
4. **メモリ制限**: MacBook Air 2017 (8GB RAM)

### 対応予定
- [ ] エラーログの実装
- [ ] リトライ機能の追加
- [ ] オフライン対応（ローカル保存）

---

## 📈 成功指標

### Phase 1 完了基準
- [ ] GitHubリポジトリが作成された
- [ ] `diary-summarize.py` が動作する（JSON出力）
- [ ] `diary-push.sh` が動作する（GitHub push）
- [ ] 実際の日記が3日分作成された
- [ ] Markdownファイルが正しくフォーマットされている

### プロジェクト全体の成功基準（最終目標）
- 毎日の日記を10秒以内で作成・保存できる
- GitHub Pagesで過去の日記を美しく閲覧できる
- AI生成画像が自動で添付される
- Instagramに自動投稿できる

---

## 🤝 開発の進め方

### 基本方針
1. **MVP優先**: 最小限の機能から実装
2. **段階的拡張**: Phase 1 → 2 → 3 → 4 の順
3. **テスト駆動**: 各Phaseで動作確認
4. **ドキュメント重視**: 実装前に設計を明確化

### コミュニケーション
- 実装時の質問は具体的に（エラーメッセージ、実行コマンド、期待動作）
- 成功時も報告（どこまで進んだか）
- 困ったら早めに相談

---

*最終更新: 2025年2月8日*
*プロジェクト状態: Phase 1 実装中*
