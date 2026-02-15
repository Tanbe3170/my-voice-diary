# voice-diary 技術仕様書

## 1. システムアーキテクチャ

### 1.1 全体構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                         voice-diary システム                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [入力層]                                                       │
│   ┌──────────────┐      ┌──────────────────────────┐          │
│   │スマホ音声入力 │      │Ubuntu音声認識            │          │
│   │(SuperWhisper)│      │(Nerd Dictation + Vosk) │          │
│   └──────┬───────┘      └──────────┬───────────────┘          │
│          │                         │                           │
│          └─────────────┬───────────┘                           │
│                        │                                       │
│                        ▼                                       │
│  [処理層]                                                       │
│          ┌──────────────────────┐                              │
│          │ diary-summarize.py   │                              │
│          │ (Claude API連携)     │                              │
│          └──────────┬───────────┘                              │
│                     │                                          │
│                     ▼                                          │
│          ┌──────────────────────┐                              │
│          │ JSON出力              │                              │
│          │ {title, summary,      │                              │
│          │  body, tags,          │                              │
│          │  image_prompt}        │                              │
│          └──────────┬───────────┘                              │
│                     │                                          │
│                     ▼                                          │
│  [保存層]                                                       │
│          ┌──────────────────────┐                              │
│          │ diary-push.sh        │                              │
│          │ (Markdown生成+push)  │                              │
│          └──────────┬───────────┘                              │
│                     │                                          │
│                     ▼                                          │
│          ┌──────────────────────┐                              │
│          │ GitHub Repository    │                              │
│          │ diaries/YYYY/MM/     │                              │
│          │   YYYY-MM-DD.md      │                              │
│          └──────────┬───────────┘                              │
│                     │                                          │
│                     ▼                                          │
│  [閲覧層]                                                       │
│          ┌──────────────────────┐                              │
│          │ GitHub Pages         │                              │
│          │ (静的サイト)         │                              │
│          └──────────────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. データフロー仕様

### 2.1 Phase 1: 基本パイプライン

```
[1. 音声入力]
   ↓ (口語テキスト)
   
[2. Claude API]
   - モデル: claude-sonnet-4-20250514
   - 入力: 口語テキスト
   - 処理: 文語変換、構造化
   - 出力: JSON
   
[3. JSON構造]
   {
     "date": "YYYY年MM月DD日",
     "title": "15文字以内のタイトル",
     "summary": "3行サマリー",
     "body": "詳細本文（段落分け）",
     "tags": ["#タグ1", "#タグ2", ...],
     "image_prompt": "DALL-E用英語プロンプト"
   }
   
[4. Markdown生成]
   - YAML Front Matter
   - 本文
   - 保存: diaries/YYYY/MM/YYYY-MM-DD.md
   
[5. Git操作]
   - git add
   - git commit -m "diary: YYYY-MM-DD - タイトル"
   - git push origin main
```

---

## 3. API仕様

### 3.1 Claude API

**エンドポイント**: `https://api.anthropic.com/v1/messages`

**認証**: Bearer Token（`ANTHROPIC_API_KEY`）

**リクエスト例**:
```python
import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=2000,
    messages=[
        {"role": "user", "content": "プロンプト"}
    ]
)
```

**レスポンス構造**:
```python
{
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "content": [
        {
            "type": "text",
            "text": "JSONまたはテキスト"
        }
    ],
    "model": "claude-sonnet-4-20250514",
    "stop_reason": "end_turn",
    "usage": {
        "input_tokens": 150,
        "output_tokens": 800
    }
}
```

**レート制限**:
- 無料枠: 詳細は要確認
- エラーハンドリング: リトライロジック推奨

---

### 3.2 GitHub REST API（Phase 2以降）

**エンドポイント**: `https://api.github.com/repos/{owner}/{repo}/contents/{path}`

**認証**: Personal Access Token（`GITHUB_TOKEN`）

**用途**: 
- ファイル一覧取得（GitHub Pages用）
- メタデータ取得

---

## 4. データモデル

### 4.1 日記エンティティ

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| date | String | ✓ | YYYY-MM-DD形式 |
| title | String | ✓ | 15文字以内 |
| summary | String | ✓ | 3行、各行30文字程度 |
| body | String | ✓ | 詳細本文（段落分け） |
| tags | Array<String> | ✓ | ハッシュタグ（5個程度） |
| image_prompt | String | ✓ | DALL-E用プロンプト（英語） |

### 4.2 Markdownフォーマット

**YAML Front Matter**:
```yaml
---
title: "日記のタイトル"
date: 2025-02-08
tags: [#タグ1, #タグ2, #タグ3]
image_prompt: "A person working on..."
---
```

**本文構造**:
```markdown
# タイトル

## 📅 日付

### 📖 サマリー

サマリー1行目
サマリー2行目
サマリー3行目

---

本文段落1

本文段落2

---

**Tags:** #タグ1 #タグ2 #タグ3
```

---

## 5. ファイル構造

### 5.1 ディレクトリレイアウト

```
voice-diary/
├── scripts/                     # スクリプト
│   ├── diary-summarize.py       # 日記整形
│   ├── diary-push.sh            # GitHub保存
│   ├── image-gen.py             # 画像生成（Phase 3）
│   └── instagram-post.py        # Instagram投稿（Phase 4）
│
├── diaries/                     # 日記データ
│   └── YYYY/                    # 年ディレクトリ
│       └── MM/                  # 月ディレクトリ
│           └── YYYY-MM-DD.md    # 日記ファイル
│
├── images/                      # 生成画像
│   └── YYYY-MM-DD_*.png
│
├── docs/                        # GitHub Pages
│   ├── index.html               # メインページ
│   ├── style.css                # スタイル
│   ├── script.js                # JavaScript
│   └── diary/                   # 日記HTML
│       └── YYYY-MM-DD.html
│
├── assets/                      # アセット
│   ├── diary-template.md
│   ├── character-config.yml
│   └── instagram-template.txt
│
├── README.md                    # プロジェクト説明
├── SETUP.md                     # セットアップ手順
├── PROJECT_OVERVIEW.md          # プロジェクト概要
├── IMPLEMENTATION_PLAN.md       # 実装計画
├── TECHNICAL_SPEC.md            # 技術仕様（本ファイル）
└── .gitignore                   # Git除外設定
```

---

## 6. スクリプト仕様

### 6.1 diary-summarize.py

**目的**: 口語テキストをClaude APIで日記形式に整形

**入力**:
- 第1引数: 口語テキスト（String）

**出力**:
- 標準出力: JSON形式の日記データ
- 標準エラー出力: ログメッセージ

**実行例**:
```bash
python3 scripts/diary-summarize.py "今日は..."
```

**出力例**:
```json
{
  "date": "2025年02月08日",
  "title": "フクロウ図鑑開発進捗",
  "summary": "朝からDB設定を行った。\nPostgreSQL接続に成功。\nFlywayマイグレーションも完了した。",
  "body": "今日は朝からフクロウ図鑑...",
  "tags": ["#日記", "#開発", "#SpringBoot"],
  "image_prompt": "A developer working on..."
}
```

**エラーコード**:
- 1: APIキー未設定
- 1: Claude APIエラー
- 1: JSON抽出失敗

---

### 6.2 diary-push.sh

**目的**: 整形された日記をMarkdownファイルにしてGitHubにpush

**入力**:
- 第1引数: 口語テキスト（String）

**処理フロー**:
1. `diary-summarize.py` を実行してJSON取得
2. JSONから各フィールドを抽出（`jq`使用）
3. Markdownファイルを生成
4. `diaries/YYYY/MM/YYYY-MM-DD.md` に保存
5. `git add`, `git commit`, `git push`

**実行例**:
```bash
bash scripts/diary-push.sh "今日は..."
```

**出力**:
```
🤖 Claude APIで日記を整形中...
✅ 整形完了！
  タイトル: フクロウ図鑑開発進捗
📝 Markdownファイルを生成中...
✅ ファイル作成完了: /home/minori/diary/diaries/2025/02/2025-02-08.md
📤 GitHubにプッシュ中...
✅ GitHubへのプッシュが完了しました！

📂 保存先: /home/minori/diary/diaries/2025/02/2025-02-08.md
🔗 GitHub: https://github.com/USERNAME/my-voice-diary/blob/main/diaries/2025/02/2025-02-08.md
```

**依存コマンド**:
- `jq` - JSONパーサー（`sudo apt install jq`）
- `git` - バージョン管理

**エラーコード**:
- 1: 引数不足
- 1: `diary-summarize.py` エラー
- 1: `git push` エラー

---

## 7. プロンプトエンジニアリング

### 7.1 日記整形プロンプト

**目的**: 口語テキストを文語の日記に変換

**プロンプト構造**:

```
あなたは日記執筆のアシスタントです。以下の音声入力テキスト（口語）を、文語の日記形式に整形してください。

【音声入力テキスト】
{raw_text}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

```json
{
  "date": "{today}",
  "title": "その日の出来事を要約した魅力的なタイトル（15文字以内）",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "body": "詳細な日記本文（段落分けあり、文語体で整った文章）",
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "この日記から1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）"
}
```

【整形のルール】
1. 口語（「〜でした」「〜なんだけど」）→ 文語（「〜だった」「〜だが」）
2. タイトルは読者の興味を引く工夫をする
3. サマリーは3行で要点をまとめる
4. 本文は適度に段落分けし、読みやすくする
5. ハッシュタグはInstagram投稿を想定（#日記 #今日の出来事 など）
6. 画像プロンプトは情景が浮かぶような具体的な英語で記述

それでは、音声入力テキストを日記に整形してください。
```

**調整ポイント**:
- タイトルの文字数（現在15文字）
- サマリーの行数・文字数（現在3行30文字）
- ハッシュタグの数（現在5個程度）
- 文体（現在は文語）

---

## 8. セキュリティ仕様

### 8.1 APIキー管理

**保存場所**: `~/.bashrc`

**設定方法**:
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export GITHUB_TOKEN="ghp_..."
```

**アクセス制限**:
- ファイルパーミッション: `chmod 600 ~/.bashrc`
- `.gitignore`に追加: `.env`, `*.key`

**注意事項**:
- APIキーは絶対にGitにコミットしない
- 共有リポジトリでは環境変数を使用

---

### 8.2 Webアプリケーションセキュリティ（Phase 2）

**XSS対策**:
- ✅ innerHTML使用禁止 - すべてDOM構築（createElement + textContent）に変更
- ✅ 外部データ（Claude API、GitHub API応答）を安全に表示
- ✅ showError関数もDOM構築方式

**APIキー保護（暫定対策）**:
- ✅ localStorage → sessionStorage移行（ブラウザタブ終了で自動削除）
- ✅ セキュリティ警告の表示（個人使用、共有PC禁止）
- ✅ beforeunloadイベントでsessionStorage削除
- ⚠️ 暫定措置: Phase 2.5で根本解決予定

**Phase 2.5での完全対策（計画中）**:
- Vercel Serverless Function導入
- APIキーをブラウザから完全削除（サーバー側保持）
- 短命セッショントークン方式
- 詳細: PHASE_2.5_GUIDE.md参照

**codex-review結果**:
- Phase 2: ok: true（XSS問題解決）
- Phase 2.5: 未実施（実装後にレビュー予定）

---

### 8.3 データプライバシー

**公開範囲**:
- GitHubリポジトリ: Public（変更可能）
- GitHub Pages: Public
- Instagram: Public

**機密情報の扱い**:
- 個人情報は日記に含めない
- 必要に応じてプライベートリポジトリに変更

---

## 9. パフォーマンス仕様

### 9.1 処理時間目標

| 処理 | 目標時間 | 実測値 |
|------|---------|--------|
| Claude API リクエスト | < 5秒 | TBD |
| JSON抽出 | < 0.1秒 | TBD |
| Markdown生成 | < 0.1秒 | TBD |
| Git push | < 3秒 | TBD |
| **合計** | **< 10秒** | TBD |

### 9.2 リソース使用量

| リソース | 想定使用量 |
|---------|-----------|
| Claude API トークン | ~1000 tokens/日記 |
| ディスク容量 | ~5KB/日記 |
| Git リポジトリサイズ | ~2MB/年 |

---

## 10. エラーハンドリング

### 10.1 エラー分類

| エラータイプ | 原因 | 対応 |
|-------------|------|------|
| 環境エラー | APIキー未設定 | エラーメッセージ表示 |
| ネットワークエラー | Claude API到達不可 | リトライ（3回まで） |
| APIエラー | レート制限、無効なリクエスト | エラー内容を表示 |
| Gitエラー | push失敗 | エラー内容を表示 |

### 10.2 ログ出力

**標準エラー出力**:
```
🤖 Claude APIにリクエスト送信中...
✅ レスポンス受信完了
📝 整形完了！
  タイトル: [タイトル]
  ハッシュタグ: [ハッシュタグ]
```

**エラーメッセージ**:
```
❌ エラー: ANTHROPIC_API_KEYが設定されていません

以下のコマンドで設定してください:
  export ANTHROPIC_API_KEY='sk-ant-api03-...'

または ~/.bashrc に追加してください:
  echo 'export ANTHROPIC_API_KEY="sk-ant-api03-..."' >> ~/.bashrc
  source ~/.bashrc
```

---

## 11. テスト仕様

### 11.1 ユニットテスト

**対象**: `diary-summarize.py`の各関数

**テストケース**:
1. `check_api_key()` - APIキー存在チェック
2. `create_diary_prompt()` - プロンプト生成
3. `extract_json_from_response()` - JSON抽出
4. `summarize_diary()` - 日記整形

### 11.2 統合テスト

**テストケース**:

| # | 入力 | 期待される出力 |
|---|------|---------------|
| 1 | 基本的な口語テキスト | 整形されたJSON |
| 2 | 長文（500文字以上） | 整形されたJSON |
| 3 | 絵文字・記号を含む | 整形されたJSON |
| 4 | 空文字列 | エラーメッセージ |

### 11.3 E2Eテスト

**シナリオ**:
1. 音声入力 → 整形 → GitHub保存 → 閲覧
2. 複数日記の連続作成
3. エラーリカバリー（ネットワーク断、APIキー無効）

---

## 12. 運用仕様

### 12.1 日次運用

**手順**:
```bash
# 1. 仮想環境有効化（自動化済み）
source ~/diary-env/bin/activate

# 2. 日記作成
cd ~/diary
bash scripts/diary-push.sh "今日の出来事..."

# 3. 確認
git log --oneline -1
```

### 12.2 週次メンテナンス

**チェック項目**:
- [ ] APIキーの有効期限確認
- [ ] ディスク容量確認
- [ ] バックアップ（Gitリポジトリ）
- [ ] 生成された日記の品質チェック

---

## 13. 拡張性

### 13.1 Phase 2以降の拡張

**追加予定の技術**:
- GitHub Pages（HTML/CSS/JS）
- OpenAI API（DALL-E 3）
- Instagram Graph API

**アーキテクチャの変更**:
- データベース不要（Markdownで十分）
- バックエンド不要（静的サイト生成）
- 認証不要（公開日記）

---

*最終更新: 2025年2月8日*
*バージョン: 1.0*
