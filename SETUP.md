# voice-diary セットアップガイド v2（完全版）

> **更新日**: 2025年2月9日  
> **対象**: Phase 1〜5 すべての機能のセットアップ手順

---

## 📋 目次

1. [Phase 1: 基本機能（Ubuntu PC）](#phase-1-基本機能ubuntu-pc)
2. [Phase 2: Webフォーム＋スマホ音声入力](#phase-2-webフォームスマホ音声入力)
3. [Phase 3: Ubuntu音声認識](#phase-3-ubuntu音声認識)
4. [Phase 4: AI画像生成](#phase-4-ai画像生成)
5. [Phase 5: Instagram自動投稿](#phase-5-instagram自動投稿)
6. [トラブルシューティング](#トラブルシューティング)

---

## Phase 1: 基本機能（Ubuntu PC）

### 前提条件チェック

```bash
# 1. Python バージョン確認
python3 --version  # 3.10.7 以上

# 2. Git バージョン確認
git --version  # 2.x 以上

# 3. 仮想環境確認
which python3  # /home/minori/diary-env/bin/python3 と表示されればOK

# 4. 環境変数確認
echo $ANTHROPIC_API_KEY  # sk-ant-api03-... と表示されればOK
echo $GITHUB_TOKEN       # ghp_... と表示されればOK
```

### 実行手順

#### ステップ1: 残り日記作成（Phase 1 完了）

```bash
cd ~/diary

# 2日目
bash scripts/diary-push.sh "今日は午前中にvoice-diaryのPhase 2の設計を行った。Webフォームと音声認識APIの実装方針を固めることができた。午後はドキュメントの整理を進めた。"

# 3日目
bash scripts/diary-push.sh "今日はGitHub Pagesの基本構造を学習した。HTMLとJavaScriptでMarkdownを読み込む方法を調査し、実装イメージが掴めてきた。明日から本格的にコーディングを開始する予定。"
```

#### 確認

```bash
# ローカルファイル確認
ls -la diaries/2026/02/

# Git ログ確認
git log --oneline -5

# GitHub で確認（ブラウザ）
# https://github.com/Tanbe3170/my-voice-diary/tree/main/diaries/2026/02
```

---

## Phase 2: Webフォーム＋スマホ音声入力

### 目標
スマホから音声入力で日記を作成できるWebアプリを構築する。

---

### ステップ1: GitHub Pages有効化（10分）

1. https://github.com/Tanbe3170/my-voice-diary にアクセス
2. **Settings** → **Pages**
3. **Source**: "Deploy from a branch"
4. **Branch**: `main`
5. **Folder**: `/docs`
6. **Save**

**確認**:
- 5分後、https://tanbe3170.github.io/my-voice-diary/ にアクセス
- 「404」が表示されればOK（まだファイルがないため）

---

### ステップ2: HTMLファイル作成（3時間）

#### 2.1: `docs/index.html` 作成

```bash
cd ~/diary
mkdir -p docs

# index.htmlを作成（IMPLEMENTATION_PLAN_v2.md のタスク2.2を参照）
nano docs/index.html
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク2.2」のコードをコピー

---

#### 2.2: `docs/diary-input.html` 作成（重要）

```bash
nano docs/diary-input.html
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク2.3」のコードをコピー

**重要なポイント**:
- Web Speech API実装済み
- SuperWhisper対応（貼り付け）
- Claude API呼び出し
- GitHub API経由でpush

---

#### 2.3: `docs/style.css` 作成

```bash
nano docs/style.css
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク2.4」のコードをコピー

---

#### 2.4: `docs/app.js` 作成

```bash
nano docs/app.js
```

**基本構造**:
```javascript
// 日記一覧を取得してカレンダー表示するロジック
// （詳細実装は後のPhaseで）

console.log('My Voice Diary App loaded!');
```

---

#### 2.5: PWA設定

**`docs/manifest.json`**:
```bash
nano docs/manifest.json
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク2.5」のコードをコピー

**`docs/service-worker.js`**:
```bash
nano docs/service-worker.js
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク2.5」のコードをコピー

---

### ステップ3: GitHubにプッシュ

```bash
cd ~/diary

git add docs/
git commit -m "feat: Phase 2 - Add web form with voice input support"
git push origin main
```

**確認**:
- 5分後、https://tanbe3170.github.io/my-voice-diary/ にアクセス
- 日記一覧ページが表示される
- 「✏️ 新しい日記を作成」ボタンが表示される

---

### ステップ4: Webフォームテスト

1. https://tanbe3170.github.io/my-voice-diary/diary-input.html にアクセス
2. **初回のみ**: Claude API Key と GitHub Token を入力（LocalStorageに保存される）
3. **音声入力を試す**:
   - 🎤 ボタンをクリック
   - 話す
   - ⏹️ ボタンで停止
4. **処理実行**:
   - 「🤖 Claude APIで整形してGitHubに保存」をクリック
5. **確認**:
   - GitHubで新しい日記ファイルが作成される

---

### トラブルシューティング（Phase 2）

#### 問題1: 音声認識が動作しない

**原因**: ブラウザが音声認識に対応していない

**解決方法**:
- Google Chrome または Microsoft Edge を使用
- Safari (iOS) も対応
- Firefox は未対応

---

#### 問題2: GitHub API エラー

**原因**: Personal Access Token の権限不足

**解決方法**:
1. https://github.com/settings/tokens にアクセス
2. トークンを再生成
3. **Scopes**: `repo` にチェック
4. **Generate token**
5. 新しいトークンをWebフォームに再入力

---

#### 問題3: Claude API エラー（認証失敗）

**原因**: APIキーが無効 or クレジット不足

**解決方法**:
1. https://console.anthropic.com/ にアクセス
2. **Billing** → クレジット残高確認
3. 必要に応じてクレジット購入

---

## Phase 3: Ubuntu音声認識

### 目標
Ubuntu環境でオフライン音声認識を実装する。

---

### ステップ1: pipxインストール（5分）

```bash
# pipxがない場合
sudo apt update
sudo apt install -y pipx
pipx ensurepath

# シェル再起動
source ~/.bashrc

# 確認
pipx --version
```

---

### ステップ2: Nerd Dictationインストール（10分）

```bash
pipx install nerd-dictation

# 確認
nerd-dictation --help
```

**期待される出力**:
```
usage: nerd-dictation [-h] {begin,end,cancel} ...
```

---

### ステップ3: Voskモデルダウンロード（15分）

```bash
cd ~

# 日本語モデル（約50MB）
wget https://alphacephei.com/vosk/models/vosk-model-small-ja-0.22.zip
unzip vosk-model-small-ja-0.22.zip
rm vosk-model-small-ja-0.22.zip

# 確認
ls ~/vosk-model-small-ja-0.22/
# conf  README  am  graph  ivector  model の6ファイルが存在すればOK
```

---

### ステップ4: 音声認識テスト（10分）

```bash
# 音声認識開始
nerd-dictation begin --vosk-model-dir=~/vosk-model-small-ja-0.22 &

# マイクに向かって話す
# 例: 「今日は朝からプログラミングの学習をしていました。」

# 音声認識終了
nerd-dictation end

# クリップボード内容確認
xclip -o -selection clipboard
```

**期待される出力**:
```
今日は朝からプログラミングの学習をしていました
```

---

### ステップ5: diary-voice.sh 作成（30分）

```bash
cd ~/diary/scripts

# スクリプト作成
nano diary-voice.sh
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク3.3」のコードをコピー

**実行権限付与**:
```bash
chmod +x ~/diary/scripts/diary-voice.sh
```

---

### ステップ6: エイリアス設定（5分）

```bash
# ~/.bashrc に追加
nano ~/.bashrc
```

**追加内容**:
```bash
# voice-diary ショートカット
alias diary-voice='bash ~/diary/scripts/diary-voice.sh'
alias diary='bash ~/diary/scripts/diary-push.sh'
```

**反映**:
```bash
source ~/.bashrc
```

---

### ステップ7: 音声入力テスト（10分）

```bash
# 音声入力モード起動
diary-voice
```

**手順**:
1. Enterキーを押す
2. マイクに向かって日記を話す
3. 話し終わったらEnterキーを押す
4. 認識されたテキストを確認
5. `y` で日記作成を確定

**確認**:
```bash
# 作成された日記を確認
cat diaries/2026/02/$(date +%Y-%m-%d).md
```

---

### トラブルシューティング（Phase 3）

#### 問題1: `command not found: nerd-dictation`

**原因**: pipxのパスが通っていない

**解決方法**:
```bash
pipx ensurepath
source ~/.bashrc
```

---

#### 問題2: マイクが認識されない

**原因**: マイクデバイスが正しく設定されていない

**解決方法**:
```bash
# マイクデバイス一覧確認
arecord -l

# マイクテスト
arecord -d 5 test.wav
aplay test.wav
```

---

#### 問題3: 音声認識精度が低い

**原因**: Voskの軽量モデルは精度が限定的

**解決方法**:
- 大きめの音声でゆっくり話す
- または、より大きなモデルをダウンロード:
  - `vosk-model-ja-0.22` (約1GB、高精度)

```bash
cd ~
wget https://alphacephei.com/vosk/models/vosk-model-ja-0.22.zip
unzip vosk-model-ja-0.22.zip
rm vosk-model-ja-0.22.zip

# diary-voice.sh の VOSK_MODEL パスを変更
nano ~/diary/scripts/diary-voice.sh
# VOSK_MODEL="$HOME/vosk-model-ja-0.22" に変更
```

---

## Phase 4: AI画像生成

### 目標
DALL-E 3で日記から自動画像生成する。

---

### ステップ1: OpenAI APIキー取得（30分）

#### 1.1: アカウント作成

1. https://platform.openai.com/signup にアクセス
2. メールアドレスで登録
3. 電話番号認証

#### 1.2: クレジットカード登録

1. **Billing** → **Payment methods**
2. クレジットカード情報を入力
3. **初回$5の無料クレジット**が付与される

#### 1.3: APIキー作成

1. **API keys** → **Create new secret key**
2. キー名: `voice-diary`
3. **Create secret key**
4. キーをコピー（表示は1回のみ）

---

### ステップ2: 環境変数設定（5分）

```bash
# ~/.bashrc に追加
nano ~/.bashrc
```

**追加内容**:
```bash
# OpenAI API
export OPENAI_API_KEY="sk-proj-..."
```

**反映**:
```bash
source ~/.bashrc

# 確認
echo $OPENAI_API_KEY
```

---

### ステップ3: image-gen.py 作成（30分）

```bash
cd ~/diary/scripts

# スクリプト作成
nano image-gen.py
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク4.2」のコードをコピー

**実行権限付与**:
```bash
chmod +x ~/diary/scripts/image-gen.py
```

---

### ステップ4: テスト実行（10分）

```bash
cd ~/diary

# 既存の日記に画像を生成
python3 scripts/image-gen.py diaries/2026/02/2026-02-09.md
```

**期待される動作**:
1. `🎨 DALL-E 3で画像生成中...` が表示される
2. 約10〜30秒で画像が生成される
3. `images/2026-02-09.png` が保存される
4. Markdownファイルに画像パスが追加される

**確認**:
```bash
# 画像ファイル確認
ls -lh images/

# Markdown確認
cat diaries/2026/02/2026-02-09.md
# ![Generated Image](...)  という行が追加されているはず
```

---

### ステップ5: diary-push.sh 統合（30分）

```bash
# diary-push.sh を編集
nano ~/diary/scripts/diary-push.sh
```

**最後に追加**: IMPLEMENTATION_PLAN_v2.md の「タスク4.3」のコードをコピー

---

### ステップ6: 統合テスト（10分）

```bash
cd ~/diary

# 新しい日記を作成（画像生成あり）
bash scripts/diary-push.sh "今日はAI画像生成機能を実装した。DALL-E 3のAPIを使って、日記の内容から自動で画像を生成できるようになった。初めて生成された画像を見たときは感動した。"
```

**手順**:
1. 日記が整形される
2. GitHubにpushされる
3. `画像を生成しますか？ (y/n):` と聞かれる
4. `y` を入力
5. 画像が生成される（約20秒）
6. GitHubに再プッシュされる

---

### コスト見積もり（Phase 4）

| 項目 | 価格 | 備考 |
|------|------|------|
| DALL-E 3 (standard, 1024x1024) | $0.040/枚 | 推奨 |
| DALL-E 3 (standard, 1792x1024) | $0.080/枚 | ワイド画像 |
| DALL-E 3 (hd, 1024x1024) | $0.080/枚 | 高画質 |

**月間コスト例**:
- 毎日1枚生成: 30枚 × $0.04 = **$1.2/月**

---

### トラブルシューティング（Phase 4）

#### 問題1: `❌ DALL-E API エラー: Billing hard limit reached`

**原因**: クレジット残高不足

**解決方法**:
1. https://platform.openai.com/account/billing にアクセス
2. **Add payment details** → クレジットカード登録
3. または **Add credits** → プリペイド購入

---

#### 問題2: 画像生成が遅い（1分以上）

**原因**: DALL-E 3のサーバー負荷

**解決方法**:
- 通常10〜30秒で完了
- 1分以上かかる場合は再実行

---

#### 問題3: 画像がMarkdownに表示されない

**原因**: 画像パスの相対パスが間違っている

**解決方法**:
```bash
# Markdownファイルを手動で編集
nano diaries/2026/02/2026-02-09.md

# 以下の行を追加（YAML Front Matterの後）
# ![Generated Image](../../../images/2026-02-09.png)
```

---

## Phase 5: Instagram自動投稿

### 目標
Instagram Graph APIで日記と画像を自動投稿する。

---

### ステップ1: Meta開発者アカウント作成（30分）

#### 1.1: アカウント作成

1. https://developers.facebook.com/ にアクセス
2. Facebookアカウントでログイン
3. **マイアプリ** → **アプリを作成**
4. **アプリタイプ**: ビジネス
5. **アプリ名**: `Voice Diary Bot`
6. **アプリを作成**

#### 1.2: アプリID・シークレット取得

1. 作成したアプリを選択
2. **設定** → **ベーシック**
3. **アプリID** と **app secret** をメモ

---

### ステップ2: Instagramビジネスアカウント設定（30分）

#### 2.1: ビジネスアカウントに変換

1. Instagramアプリを開く
2. プロフィール → **設定** → **アカウント**
3. **プロアカウントに切り替える**
4. カテゴリ: **ブログ** または **クリエイター**
5. **ビジネス** を選択

#### 2.2: Facebookページ作成

1. https://www.facebook.com/pages/create にアクセス
2. ページ名: `My Voice Diary`
3. カテゴリ: **個人ブログ**
4. **ページを作成**

#### 2.3: InstagramとFacebookページをリンク

1. Facebookページの **設定** → **Instagram**
2. **アカウントをリンク**
3. Instagramにログイン

---

### ステップ3: アクセストークン取得（30分）

#### 3.1: Graph APIエクスプローラーで短期トークン取得

1. Meta開発者アプリに戻る
2. **ツール** → **Graph APIエクスプローラー**
3. **ユーザーアクセストークン** → **取得**
4. 権限選択:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
5. **アクセストークンを生成**
6. トークンをコピー

#### 3.2: 短期トークンを長期トークンに変換

```bash
# 環境変数設定（一時的）
APP_ID="YOUR_APP_ID"
APP_SECRET="YOUR_APP_SECRET"
SHORT_TOKEN="SHORT_LIVED_TOKEN"

# 長期トークン取得
curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${SHORT_TOKEN}"
```

**結果**:
```json
{
  "access_token": "長期トークン...",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

**長期トークンをメモ**

---

### ステップ4: Instagram Business Account ID取得（15分）

#### 4.1: FacebookページID取得

```bash
LONG_TOKEN="長期トークン..."

curl -X GET "https://graph.facebook.com/v21.0/me/accounts?access_token=${LONG_TOKEN}"
```

**結果**:
```json
{
  "data": [
    {
      "id": "FACEBOOK_PAGE_ID",
      "name": "My Voice Diary"
    }
  ]
}
```

**FACEBOOK_PAGE_IDをメモ**

#### 4.2: Instagram Business Account ID取得

```bash
FB_PAGE_ID="FACEBOOK_PAGE_ID"

curl -X GET "https://graph.facebook.com/v21.0/${FB_PAGE_ID}?fields=instagram_business_account&access_token=${LONG_TOKEN}"
```

**結果**:
```json
{
  "instagram_business_account": {
    "id": "INSTAGRAM_BUSINESS_ACCOUNT_ID"
  }
}
```

**INSTAGRAM_BUSINESS_ACCOUNT_IDをメモ**

---

### ステップ5: 環境変数設定（10分）

```bash
# ~/.bashrc に追加
nano ~/.bashrc
```

**追加内容**:
```bash
# Instagram Graph API
export INSTAGRAM_ACCESS_TOKEN="長期トークン..."
export INSTAGRAM_BUSINESS_ACCOUNT_ID="123456789..."
```

**反映**:
```bash
source ~/.bashrc

# 確認
echo $INSTAGRAM_ACCESS_TOKEN
echo $INSTAGRAM_BUSINESS_ACCOUNT_ID
```

---

### ステップ6: instagram-post.py 作成（1時間）

```bash
cd ~/diary/scripts

# スクリプト作成
nano instagram-post.py
```

**内容**: IMPLEMENTATION_PLAN_v2.md の「タスク5.2」のコードをコピー

**実行権限付与**:
```bash
chmod +x ~/diary/scripts/instagram-post.py
```

---

### ステップ7: テスト投稿（30分）

#### 7.1: GitHubリポジトリをPublicに変更（重要）

**理由**: Instagram Graph APIは画像の公開URLを要求するため

1. https://github.com/Tanbe3170/my-voice-diary にアクセス
2. **Settings** → **General**
3. **Danger Zone** → **Change repository visibility**
4. **Change visibility** → **Public**
5. パスワードを入力して確認

#### 7.2: テスト投稿実行

```bash
cd ~/diary

# 画像付きの日記に対して投稿テスト
python3 scripts/instagram-post.py diaries/2026/02/2026-02-09.md
```

**手順**:
1. 投稿内容プレビューが表示される
2. `この内容でInstagramに投稿しますか？ (y/n):` と聞かれる
3. `y` を入力
4. メディアコンテナ作成（約5秒）
5. メディア公開（約10秒）
6. `✅ Instagramへの投稿が完了しました！` が表示される

**確認**:
- Instagramアプリを開く
- 自分のプロフィールに投稿が表示される

---

### ステップ8: diary-push.sh 統合（30分）

```bash
# diary-push.sh を編集
nano ~/diary/scripts/diary-push.sh
```

**最後に追加**: IMPLEMENTATION_PLAN_v2.md の「タスク5.3」のコードをコピー

---

### トラブルシューティング（Phase 5）

#### 問題1: `❌ メディアコンテナ作成エラー: Invalid image URL`

**原因**: 画像URLが公開されていない（プライベートリポジトリ）

**解決方法**:
- リポジトリをPublicに変更（上記 ステップ7.1 参照）

---

#### 問題2: `❌ メディア公開エラー: Instagram account not found`

**原因**: Instagram Business Account IDが間違っている

**解決方法**:
```bash
# 再度IDを取得
curl -X GET "https://graph.facebook.com/v21.0/${FB_PAGE_ID}?fields=instagram_business_account&access_token=${LONG_TOKEN}"

# ~/.bashrc の INSTAGRAM_BUSINESS_ACCOUNT_ID を更新
nano ~/.bashrc
source ~/.bashrc
```

---

#### 問題3: `❌ メディア公開エラー: Permission denied`

**原因**: アクセストークンの権限不足

**解決方法**:
1. Graph APIエクスプローラーに戻る
2. 権限を再確認（特に `instagram_content_publish`）
3. トークンを再生成
4. 環境変数を更新

---

## 📊 全体の動作確認（Phase 1〜5 統合）

### 完全パイプラインテスト

```bash
cd ~/diary

# ステップ1: 音声入力で日記作成（Ubuntu）
diary-voice
# → マイクで話す → 日記整形 → GitHub保存

# ステップ2: 画像生成
# → diary-push.sh 実行時に `y` で画像生成

# ステップ3: Instagram投稿
# → diary-push.sh 実行時に `y` でInstagram投稿

# すべて完了！
```

**確認箇所**:
- [x] GitHub: https://github.com/Tanbe3170/my-voice-diary/tree/main/diaries
- [x] GitHub Pages: https://tanbe3170.github.io/my-voice-diary/
- [x] Instagram: 自分のプロフィールページ

---

## 🎓 補足情報

### APIコスト一覧

| API | 用途 | コスト |
|-----|------|--------|
| Claude API | 日記整形 | ~$0.01/回 |
| DALL-E 3 | 画像生成 | $0.04/枚 |
| Instagram Graph API | 投稿 | $0 |

**月間コスト例**（毎日投稿）:
- Claude: 30回 × $0.01 = **$0.3**
- DALL-E: 30枚 × $0.04 = **$1.2**
- Instagram: **$0**
- **合計: 約$1.5/月**

---

### エイリアス一覧

```bash
# 使いやすいコマンド
diary-voice        # 音声入力モード（Ubuntu）
diary "テキスト"   # 手動テキスト入力モード
```

---

### よくある質問（FAQ）

**Q1: SuperWhisperを使うにはどうすればいいですか？**

A1: SuperWhisperアプリで音声をテキスト化した後、Webフォーム（`diary-input.html`）にコピー＆ペーストしてください。

---

**Q2: 画像生成をスキップできますか？**

A2: はい。`diary-push.sh` 実行時に `画像を生成しますか？ (y/n):` で `n` を入力してください。

---

**Q3: Instagram投稿を後から行えますか？**

A3: はい。以下のコマンドで既存の日記を投稿できます：

```bash
python3 ~/diary/scripts/instagram-post.py diaries/2026/02/2026-02-09.md
```

---

**Q4: プライベートリポジトリでInstagram投稿できますか？**

A4: いいえ。Instagram Graph APIは画像の公開URLを要求するため、リポジトリをPublicにする必要があります。

代替案: 画像を別のホスティングサービス（Imgur, Cloudinary等）にアップロードする実装を追加

---

**Q5: アクセストークンの有効期限は？**

A5: 
- 短期トークン: 1時間
- 長期トークン: 60日

60日後に再度トークンを更新する必要があります。

---

## 📝 次のステップ

すべてのPhaseが完了したら：

1. **スキル化**: `my-skill-creator` で再利用可能なスキルを作成
2. **ドキュメント整備**: FAQ.md, CHANGELOG.md を作成
3. **運用改善**: cron設定で自動化、プロンプト最適化

---

**作成日**: 2025年2月9日  
**バージョン**: 2.0  
**対象**: Phase 1〜5 完全版
