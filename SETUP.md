# 🚀 voice-diary Phase 1 実行手順書

このドキュメントは、実際のUbuntu環境（MacBook Air 2017）でvoice-diaryを実行するための手順です。

---

## 📋 前提条件チェック

### 1. 環境変数の確認

```bash
# APIキーとGitHubトークンが設定されているか確認
echo $ANTHROPIC_API_KEY  # sk-ant-api03-... と表示されればOK
echo $GITHUB_TOKEN       # ghp_... と表示されればOK
```

もし何も表示されない場合：

```bash
# ~/.bashrcに設定を追加
nano ~/.bashrc

# 以下を最後に追加（実際のキーに置き換える）
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export GITHUB_TOKEN="ghp_..."

# 保存して読み込み
source ~/.bashrc
```

### 2. Python仮想環境の確認

```bash
# 仮想環境が存在するか確認
ls ~/diary-env/bin/python3

# 存在しない場合は作成
python3 -m venv ~/diary-env
source ~/diary-env/bin/activate
pip install anthropic pyyaml requests

# .bashrcに自動有効化を追加
echo 'source ~/diary-env/bin/activate' >> ~/.bashrc
```

---

## 🎯 Phase 1 実行手順

### ステップ1: GitHubリポジトリ作成

#### オプションA: GitHub CLI を使用（推奨）

```bash
# GitHub CLIがインストールされているか確認
gh --version

# リポジトリ作成
gh repo create my-voice-diary --public --description "音声入力日記システム"

# ローカルにクローン
cd ~
git clone git@github.com:YOUR_USERNAME/my-voice-diary.git diary
cd diary
```

#### オプションB: ブラウザで手動作成

1. https://github.com/new にアクセス
2. Repository name: `my-voice-diary`
3. Public を選択
4. "Create repository" をクリック
5. ターミナルで以下を実行：

```bash
cd ~
mkdir -p diary
cd diary
git init
git remote add origin git@github.com:YOUR_USERNAME/my-voice-diary.git
```

### ステップ2: プロジェクトファイルをコピー

```bash
# Claudeで作成したファイルをUbuntu環境にコピーする必要があります
# ここでは、Claudeから提供されたファイルをダウンロードして配置してください

cd ~/diary

# ディレクトリ構造を作成
mkdir -p scripts diaries/2025/02 images docs

# 以下のファイルを配置：
# - README.md
# - .gitignore
# - scripts/diary-summarize.py
# - scripts/diary-push.sh

# スクリプトに実行権限を付与
chmod +x scripts/*.sh scripts/*.py
```

### ステップ3: 初回コミット

```bash
cd ~/diary

git add .
git commit -m "chore: 初期プロジェクト構造とスクリプトを追加"
git branch -M main
git push -u origin main
```

### ステップ4: テスト実行

#### テスト1: diary-summarize.py 単体テスト

```bash
cd ~/diary

# 仮想環境が有効か確認
which python3  # ~/diary-env/bin/python3 と表示されればOK

# テスト実行
python3 scripts/diary-summarize.py "今日は朝からフクロウ図鑑の開発をしていました。データベースの設定がうまくいって嬉しかったです。Spring BootとPostgreSQLの接続を確認して、Flywayのマイグレーションも成功しました。"
```

**期待される出力:**

```json
{
  "date": "2025年02月08日",
  "title": "フクロウ図鑑開発、DB設定成功",
  "summary": "朝からフクロウ図鑑の開発に取り組んだ。\nデータベース設定がうまくいき、喜びを感じた。\nSpring BootとPostgreSQLの接続を確認した。",
  "body": "...",
  "tags": ["#日記", "#開発", "#SpringBoot", "#PostgreSQL"],
  "image_prompt": "A person working on a laptop..."
}
```

#### テスト2: diary-push.sh 統合テスト

```bash
cd ~/diary

bash scripts/diary-push.sh "今日は朝からフクロウ図鑑の開発をしていました。データベースの設定がうまくいって嬉しかったです。"
```

**期待される動作:**

1. Claude APIで日記が整形される
2. `diaries/2025/02/2025-02-08.md` が作成される
3. GitHubに自動でpushされる
4. コミットメッセージ: `diary: 2025-02-08 - [タイトル]`

#### 確認方法

```bash
# ローカルファイルを確認
cat diaries/2025/02/2025-02-08.md

# GitHubで確認（ブラウザで開く）
# https://github.com/YOUR_USERNAME/my-voice-diary/tree/main/diaries/2025/02
```

---

## 🐛 トラブルシューティング

### エラー1: "ANTHROPIC_API_KEY が設定されていません"

```bash
# 環境変数を再読み込み
source ~/.bashrc

# 設定されているか確認
echo $ANTHROPIC_API_KEY
```

### エラー2: "command not found: jq"

```bash
# jqをインストール
sudo apt install -y jq
```

### エラー3: "git push でエラー"

```bash
# SSH鍵の設定を確認
ssh -T git@github.com  # "Hi YOUR_USERNAME!" と表示されればOK

# SSH鍵が未設定の場合
ssh-keygen -t ed25519 -C "your@email.com"
cat ~/.ssh/id_ed25519.pub
# 表示された公開鍵をGitHubに登録: https://github.com/settings/keys
```

### エラー4: "ModuleNotFoundError: No module named 'anthropic'"

```bash
# 仮想環境を有効化
source ~/diary-env/bin/activate

# パッケージをインストール
pip install anthropic pyyaml requests

# インストール確認
pip list | grep -i "anthropic\|yaml\|requests"
```

---

## ✅ Phase 1 完了チェックリスト

- [ ] GitHubリポジトリ `my-voice-diary` が作成された
- [ ] ローカルに `~/diary` としてクローンされた
- [ ] `diary-summarize.py` が動作する（JSONが出力される）
- [ ] `diary-push.sh` が動作する（GitHubにpushされる）
- [ ] GitHubのリポジトリページで日記ファイルが確認できる
- [ ] Markdownファイルが正しくフォーマットされている

すべてチェックがついたら、**Phase 1 完了**です！🎉

---

## 📝 次のステップ

Phase 1が完了したら、以下のいずれかに進むことができます：

- **Phase 2**: GitHub Pages で日記を閲覧できるようにする
- **voice-diary スキルファイルの完成**: 他の補助スクリプトを作成
- **Owl Encyclopedia に戻る**: Week 1 Days 6-7 の学習を進める

どれにするか決めたら、Claudeに教えてください！😊
