#!/bin/bash
# diary-push.sh
# 整形された日記をGitHubにpushするスクリプト
#
# 使い方:
#   bash diary-push.sh "今日は朝からフクロウ図鑑の開発をしていました..."

set -e  # エラーが発生したら即座に終了

# 色付きメッセージ用
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 引数チェック
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ エラー: 音声入力テキストを引数として渡してください${NC}"
    echo ""
    echo "使い方:"
    echo "  bash diary-push.sh \"今日は朝から...\""
    exit 1
fi

RAW_TEXT="$1"

# 仮想環境のPythonパスを確認
VENV_PYTHON="$HOME/diary-env/bin/python3"
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${YELLOW}⚠️  警告: 仮想環境が見つかりません ($VENV_PYTHON)${NC}"
    echo "通常のPythonを使用します"
    VENV_PYTHON="python3"
fi

# 日付情報
TODAY=$(date +%Y-%m-%d)
YEAR=$(date +%Y)
MONTH=$(date +%m)

# diary-summarize.py を実行してJSON取得
echo -e "${BLUE}🤖 Claude APIで日記を整形中...${NC}"
DIARY_JSON=$("$VENV_PYTHON" "$SCRIPT_DIR/diary-summarize.py" "$RAW_TEXT")

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 日記の整形に失敗しました${NC}"
    exit 1
fi

# JSONから各フィールドを抽出
TITLE=$(echo "$DIARY_JSON" | jq -r '.title')
SUMMARY=$(echo "$DIARY_JSON" | jq -r '.summary')
BODY=$(echo "$DIARY_JSON" | jq -r '.body')
TAGS=$(echo "$DIARY_JSON" | jq -r '.tags | map("\"" + . + "\"") | join(", ")')
IMAGE_PROMPT=$(echo "$DIARY_JSON" | jq -r '.image_prompt')

echo -e "${GREEN}✅ 整形完了！${NC}"
echo "  タイトル: $TITLE"

# Markdownファイルのディレクトリとパスを作成
DIARY_DIR="$PROJECT_DIR/diaries/$YEAR/$MONTH"
DIARY_FILE="$DIARY_DIR/$TODAY.md"

mkdir -p "$DIARY_DIR"

# Markdownファイルを生成
echo -e "${BLUE}📝 Markdownファイルを生成中...${NC}"

cat > "$DIARY_FILE" << EOF
---
title: "$TITLE"
date: $TODAY
tags: [$TAGS]
image_prompt: "$IMAGE_PROMPT"
---

# $TITLE

## 📅 $TODAY

### 📖 サマリー

$SUMMARY

---

$BODY

---

**Tags:** $TAGS
EOF

echo -e "${GREEN}✅ ファイル作成完了: $DIARY_FILE${NC}"

# Gitコミット＆プッシュ
cd "$PROJECT_DIR"

# git statusで変更を確認
if git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${BLUE}📤 GitHubにプッシュ中...${NC}"
    
    git add "$DIARY_FILE"
    git commit -m "diary: $TODAY - $TITLE"
    git push origin main
    
    echo -e "${GREEN}✅ GitHubへのプッシュが完了しました！${NC}"
    echo ""
    echo "📂 保存先: $DIARY_FILE"
    echo "🔗 GitHub: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/blob/main/diaries/$YEAR/$MONTH/$TODAY.md"
else
    echo -e "${YELLOW}⚠️  警告: Gitリポジトリが初期化されていません${NC}"
    echo "以下のコマンドでGitリポジトリを初期化してください:"
    echo ""
    echo "  cd $PROJECT_DIR"
    echo "  git init"
    echo "  git remote add origin git@github.com:YOUR_USERNAME/my-voice-diary.git"
    echo "  git add ."
    echo "  git commit -m 'Initial commit'"
    echo "  git push -u origin main"
    echo ""
    echo "📂 ファイルは保存されました: $DIARY_FILE"
fi
