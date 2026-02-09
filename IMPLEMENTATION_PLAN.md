# voice-diary 詳細実装計画

## 📋 全体スケジュール

| Phase | 期間 | 工数 | 状態 |
|-------|------|------|------|
| Phase 0: 環境構築 | 完了 | 2時間 | ✅ 完了 |
| Phase 1: 基本機能 | 2-3日 | 8時間 | 🔄 進行中 |
| Phase 2: GitHub Pages | 3-4日 | 12時間 | 📅 未着手 |
| Phase 3: AI画像生成 | 2-3日 | 8時間 | 📅 未着手 |
| Phase 4: Instagram連携 | 2-3日 | 8時間 | 📅 未着手 |

**合計工数**: 約38時間  
**完成目標**: 2週間以内

---

## 🎯 Phase 1: 基本機能（現在のフェーズ）

### 目標
音声入力テキスト → Claude API整形 → GitHub保存の基本パイプラインを完成させる。

### 成果物
1. ✅ `scripts/diary-summarize.py` - Claude APIで日記整形
2. ✅ `scripts/diary-push.sh` - GitHubに自動push
3. ⏳ GitHubリポジトリ `my-voice-diary` の作成
4. ⏳ 初回コミット・動作確認
5. ⏳ 3日分の実際の日記作成

### 詳細タスク

#### タスク1.1: GitHubリポジトリ作成（15分）

**前提条件**:
- GitHub Token が `~/.bashrc` に設定済み
- SSH鍵がGitHubに登録済み

**実行手順**:
```bash
# GitHub CLIで作成（推奨）
gh repo create my-voice-diary --public --description "音声入力日記システム"

# ローカルにクローン
cd ~
git clone git@github.com:YOUR_USERNAME/my-voice-diary.git diary
cd diary
```

**代替手順（ブラウザ）**:
1. https://github.com/new にアクセス
2. Repository name: `my-voice-diary`
3. Public を選択
4. "Create repository" をクリック

**確認方法**:
```bash
cd ~/diary
git remote -v  # origin が表示されればOK
```

---

#### タスク1.2: プロジェクトファイル配置（10分）

**実行手順**:
```bash
cd ~/diary

# ディレクトリ構造作成
mkdir -p scripts diaries/2025/02 images docs

# ダウンロードしたファイルを配置
# - README.md → ~/diary/
# - SETUP.md → ~/diary/
# - PROJECT_OVERVIEW.md → ~/diary/
# - IMPLEMENTATION_PLAN.md → ~/diary/
# - TECHNICAL_SPEC.md → ~/diary/
# - .gitignore → ~/diary/
# - diary-summarize.py → ~/diary/scripts/
# - diary-push.sh → ~/diary/scripts/

# 実行権限付与
chmod +x scripts/*.py scripts/*.sh
```

**確認方法**:
```bash
ls -la scripts/
# diary-summarize.py と diary-push.sh が実行権限付きで存在
```

---

#### タスク1.3: 環境確認（5分）

**実行コマンド**:
```bash
# 1. 仮想環境が有効か
which python3  # ~/diary-env/bin/python3 と表示されればOK

# 2. パッケージインストール確認
pip list | grep -i "anthropic\|yaml\|requests"

# 3. APIキー確認
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:15}..."
echo "GITHUB_TOKEN: ${GITHUB_TOKEN:0:10}..."
```

**期待される結果**:
```
/home/minori/diary-env/bin/python3

anthropic        0.79.0
PyYAML          6.0.3
requests        2.32.5

ANTHROPIC_API_KEY: sk-ant-api03-...
GITHUB_TOKEN: ghp_...
```

**エラー対応**:
- パッケージ不足 → `pip install anthropic pyyaml requests`
- APIキー未設定 → `source ~/.bashrc`

---

#### タスク1.4: 初回コミット（10分）

**実行手順**:
```bash
cd ~/diary

# Gitの初期設定確認
git config user.name
git config user.email

# 未設定の場合
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# 全ファイルを追加
git add .

# 初回コミット
git commit -m "chore: 初期プロジェクト構造とスクリプトを追加

- 基本ディレクトリ構造を作成
- diary-summarize.py: Claude APIで日記整形
- diary-push.sh: GitHubに自動push
- README.md, SETUP.md: ドキュメント追加"

# ブランチ名を main に変更（必要に応じて）
git branch -M main

# GitHubにプッシュ
git push -u origin main
```

**確認方法**:
ブラウザで `https://github.com/YOUR_USERNAME/my-voice-diary` を開いて、ファイルが表示されることを確認。

---

#### タスク1.5: テスト実行（30分）

**テスト1: diary-summarize.py 単体テスト**

```bash
cd ~/diary

# テストケース1: 基本的な日記
python3 scripts/diary-summarize.py "今日は朝からフクロウ図鑑の開発をしていました。データベースの設定がうまくいって嬉しかったです。Spring BootとPostgreSQLの接続を確認して、Flywayのマイグレーションも成功しました。午後はReactの学習をして、充実した1日でした。"

# 期待される出力: JSON形式（title, summary, body, tags, image_promptが含まれる）
```

**テストケース2: 絵文字・記号を含む**

```bash
python3 scripts/diary-summarize.py "今日は😊最高の日だった！朝から☀️気分が良くて、プログラミング💻が楽しかった。"
```

**テストケース3: 長文**

```bash
python3 scripts/diary-summarize.py "$(cat << 'EOF'
今日は朝6時に起きて、まず軽くジョギングをした。最近運動不足だったので、体を動かすのが気持ち良かった。朝食はオートミールとバナナ、プロテインシェイクを摂取。

午前中はフクロウ図鑑の開発に集中した。Spring BootとPostgreSQLの接続設定を行い、Flywayでのマイグレーションがうまくいった。データベース設計書を見ながら、ENUMの定義やテーブル構造を確認できて達成感があった。

午後はReactの学習。TypeScriptとの組み合わせに少し苦戦したが、shadcn/uiのコンポーネントを試してみて、きれいなUIが作れることがわかった。Tailwind CSSも慣れてきた。

夜は友人とオンラインで通話しながらゲームをした。リフレッシュできて良かった。明日も頑張ろう。
EOF
)"
```

**テスト2: diary-push.sh 統合テスト**

```bash
cd ~/diary

# テストケース1: 基本的な日記の保存
bash scripts/diary-push.sh "今日は朝からフクロウ図鑑の開発をしていました。データベースの設定がうまくいって嬉しかったです。"

# 期待される動作:
# 1. Claude APIで日記が整形される
# 2. diaries/2025/02/2025-02-XX.md が作成される
# 3. GitHubに自動でpushされる
# 4. コミットメッセージ: "diary: 2025-02-XX - [タイトル]"
```

**確認方法**:

```bash
# 1. ローカルファイルを確認
cat diaries/2025/02/$(date +%Y-%m-%d).md

# 2. Gitログを確認
git log --oneline -5

# 3. GitHubで確認
# ブラウザで https://github.com/YOUR_USERNAME/my-voice-diary/tree/main/diaries を開く
```

---

#### タスク1.6: 3日分の実日記作成（1時間）

**目的**: 実際の使用感を確認し、改善点を洗い出す。

**実行方法**:

```bash
cd ~/diary

# 1日目
bash scripts/diary-push.sh "今日の出来事をここに記述..."

# 2日目（翌日）
bash scripts/diary-push.sh "今日の出来事をここに記述..."

# 3日目（翌々日）
bash scripts/diary-push.sh "今日の出来事をここに記述..."
```

**評価項目**:
- [ ] 日記の整形品質は満足できるか？
- [ ] タイトルは魅力的か？
- [ ] サマリーは要点を押さえているか？
- [ ] 本文は読みやすいか？
- [ ] ハッシュタグは適切か？
- [ ] 所要時間は許容範囲か？（目標: 1分以内）

**改善が必要な場合**:
- プロンプトの調整
- 出力フォーマットの変更
- エラーハンドリングの追加

---

### Phase 1 完了基準

- [x] GitHubリポジトリ `my-voice-diary` が作成された
- [x] ローカルに `~/diary` としてクローンされた
- [x] すべてのファイルが配置され、実行権限が付与された
- [x] `diary-summarize.py` が動作する（JSON出力される）
- [x] `diary-push.sh` が動作する（GitHubにpushされる）
- [x] GitHubで日記ファイルが確認できる
- [x] 3日分の実日記が作成された
- [x] 改善点がリストアップされた

---

## 🎨 Phase 2: GitHub Pages閲覧

### 目標
GitHub Pagesで過去の日記を美しく閲覧できるWebサイトを構築する。

### 成果物
1. `docs/index.html` - メインページ
2. `docs/style.css` - スタイルシート
3. `docs/script.js` - JavaScript
4. カレンダービュー
5. タグ検索機能
6. レスポンシブデザイン

### 技術スタック
- HTML5
- CSS3 (Tailwind CDN)
- JavaScript (Vanilla)
- GitHub Pages

### 詳細タスク

#### タスク2.1: GitHub Pages設定（15分）

**実行手順**:
```bash
cd ~/diary

# docs/ ディレクトリを作成（すでに存在する場合はスキップ）
mkdir -p docs

# GitHub Pagesを有効化（ブラウザで実行）
# 1. GitHubリポジトリページを開く
# 2. Settings → Pages
# 3. Source: "Deploy from a branch"
# 4. Branch: main, Folder: /docs
# 5. Save
```

---

#### タスク2.2: 基本HTML作成（1時間）

**機能要件**:
- 日記一覧表示
- 日付順でソート
- 各日記へのリンク
- シンプルで美しいデザイン

**実装ファイル**: `docs/index.html`

---

#### タスク2.3: カレンダービュー実装（2時間）

**機能要件**:
- 月次カレンダー表示
- 日記がある日を強調表示
- 日付クリックで該当日記を表示

---

#### タスク2.4: タグ検索機能（1時間）

**機能要件**:
- 全ハッシュタグの一覧表示
- タグクリックでフィルタリング
- 複数タグの組み合わせ検索

---

#### タスク2.5: レスポンシブデザイン（1時間）

**対応デバイス**:
- スマートフォン (320px〜)
- タブレット (768px〜)
- デスクトップ (1024px〜)

---

### Phase 2 完了基準

- [ ] GitHub Pagesが有効化された
- [ ] 日記一覧ページが表示される
- [ ] カレンダービューが動作する
- [ ] タグ検索機能が動作する
- [ ] スマートフォンで快適に閲覧できる
- [ ] 読み込み速度が3秒以内

---

## 🖼️ Phase 3: AI画像生成

### 目標
日記の内容から自動で画像を生成し、日記に添付する。

### 成果物
1. `scripts/image-prompt-gen.py` - 画像生成プロンプト作成（高度化）
2. DALL-E API連携スクリプト
3. 生成画像の自動保存

### 技術スタック
- DALL-E 3 (OpenAI API)
- Python Pillow (画像処理)

### 詳細タスク

#### タスク3.1: OpenAI API設定（30分）

**前提条件**:
- OpenAI APIキーの取得（有料）

**設定**:
```bash
# ~/.bashrc に追加
export OPENAI_API_KEY="sk-..."

# 反映
source ~/.bashrc
```

---

#### タスク3.2: image-gen.py 作成（2時間）

**機能要件**:
- `diary-summarize.py` のJSON出力から `image_prompt` を取得
- DALL-E 3 APIで画像生成
- `images/YYYY-MM-DD_*.png` に保存
- エラーハンドリング（API制限、ネットワークエラー）

---

#### タスク3.3: diary-push.sh に統合（1時間）

**変更内容**:
- 日記保存後、自動で画像生成
- Markdownファイルに画像パスを追加

---

### Phase 3 完了基準

- [ ] OpenAI APIキーが設定された
- [ ] `image-gen.py` が動作する
- [ ] 画像が自動生成される
- [ ] Markdownファイルに画像が埋め込まれる
- [ ] GitHub Pagesで画像が表示される

---

## 📱 Phase 4: Instagram連携

### 目標
日記と画像をInstagramに自動投稿する。

### 成果物
1. Instagram Graph API連携スクリプト
2. 投稿テンプレート
3. 自動投稿スクリプト

### 技術スタック
- Instagram Graph API
- Meta Business Suite

### 詳細タスク

#### タスク4.1: Instagram API設定（1時間）

**前提条件**:
- Meta開発者アカウント
- Instagramビジネスアカウント

---

#### タスク4.2: instagram-post.py 作成（3時間）

**機能要件**:
- 日記の本文を投稿テキストに変換
- 画像をアップロード
- ハッシュタグを自動付与
- エラーハンドリング

---

### Phase 4 完了基準

- [ ] Instagram APIが設定された
- [ ] `instagram-post.py` が動作する
- [ ] 日記が自動投稿される
- [ ] 投稿内容が適切にフォーマットされている

---

## 🔄 継続的改善

### 運用フェーズでの改善項目

1. **音声認識精度向上**
   - Vosk日本語モデルの最新版に更新
   - WhisperやGoogle Speech-to-Textとの比較検討

2. **AIプロンプト最適化**
   - ユーザーフィードバックを元に改善
   - 季節・曜日に応じた調整

3. **パフォーマンス改善**
   - キャッシュ機能の追加
   - 並列処理の導入

4. **セキュリティ強化**
   - APIキーの安全な管理（環境変数 → Vault）
   - 機密情報の自動検出・マスキング

---

*最終更新: 2025年2月8日*
*現在のフェーズ: Phase 1（タスク1.5 テスト実行 準備中）*
