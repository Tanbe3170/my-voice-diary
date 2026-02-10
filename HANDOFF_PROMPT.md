# voice-diary プロジェクト引継ぎプロンプト（完全版）

> **作成日**: 2025年2月9日  
> **対象**: Phase 1（85%完了）〜 Phase 5（音声入力 + Instagram自動投稿）  
> **次のチャット用**: このプロンプトを新しいClaude Projectまたはチャットにコピーしてください

---

## 📌 プロジェクト基本情報

### プロジェクト概要

**プロジェクト名**: voice-diary（音声入力日記システム）  
**開発者**: Minori（GitHubアカウント: Tanbe3170）  
**作業環境**: Ubuntu 22.04 LTS（MacBook Air 2017, 8GB RAM）  
**IDE**: VSCode + Claude拡張機能  
**開始日**: 2025年2月  
**現在の状況**: Phase 1 が 85%完了

---

### システム全体像

```
[音声入力層]
  ├── スマホ: SuperWhisper → Webフォーム貼り付け
  ├── スマホ: Web Speech API → Webフォーム自動入力
  └── Ubuntu: Nerd Dictation + Vosk → ターミナルスクリプト

[処理層]
  └── Claude API → 日記整形（タイトル/サマリー/本文/タグ/画像プロンプト）

[保存層]
  └── GitHub Repository (my-voice-diary)
      ├── diaries/YYYY/MM/YYYY-MM-DD.md
      └── images/YYYY-MM-DD.png

[閲覧層]
  └── GitHub Pages (https://tanbe3170.github.io/my-voice-diary/)
      ├── 日記一覧 + カレンダービュー
      └── タグ検索

[投稿層]
  └── Instagram Graph API → 自動投稿
```

---

## 👤 開発者プロフィール

**スキルレベル**:
- Java Bronze 取得済み
- 基本情報技術者 取得済み
- Java Silver 8割学習済み
- Python 初学者（学習中）
- Git/GitHub 使用経験あり（3台で同期運用中）

**開発スタイル**:
- 初学者レベル、丁寧な説明が必要
- コマンドの意味・理由の説明を重視
- ドキュメント重視、段階的実装を好む
- 実装前に設計を明確化

**作業環境**:
- メイン: Ubuntu 22.04 LTS（MacBook Air 2017, 8GB RAM）
- リモート: Windows PC 2台
- VSCode + Claude拡張機能

---

## ✅ 完了済みの作業

### Phase 0: 環境構築（完了）

- ✅ Python 3.10.7 確認済み
- ✅ Git 2.49.0 確認済み
- ✅ GitHub CLI 2.45.0 確認済み
- ✅ Python仮想環境 (`~/diary-env`) 構築済み
- ✅ 必要パッケージインストール済み
  - anthropic 0.79.0
  - PyYAML 6.0.3
  - requests 2.32.5

---

### APIキー・認証（完了）

- ✅ `ANTHROPIC_API_KEY` 設定済み（~/.bashrc）
- ✅ Claude API動作確認済み（curlテスト成功）
- ✅ クレジット残高：使用可能状態
- ✅ `GITHUB_TOKEN` 設定済み（~/.bashrc）
- ✅ GitHub認証確認済み（SSH接続、Tanbe3170アカウント）

---

### GitHubリポジトリ（完了）

- ✅ リポジトリ作成: https://github.com/Tanbe3170/my-voice-diary
- ✅ ローカルGitリポジトリ初期化（~/diary）
- ✅ ブランチ名変更: master → main
- ✅ リモート接続: git@github.com:Tanbe3170/my-voice-diary.git
- ✅ 初回コミット完了: 2873efe
- ✅ GitHubへプッシュ完了

---

### Phase 1: 基本機能（85%完了）

**完了済み**:
- ✅ `scripts/diary-summarize.py` 実装・テスト完了
  - Claude APIで口語→文語変換
  - JSON形式出力（title, summary, body, tags, image_prompt）
- ✅ `scripts/diary-push.sh` 実装・テスト完了
  - Markdownファイル自動生成
  - GitHub自動push
- ✅ 1日目の日記作成完了（2026-02-09）
  - ファイル: `diaries/2026/02/2026-02-09.md`
  - コミット: 8759336
  - GitHub URL確認済み

**残りタスク**:
- ⏳ 2日目の日記作成
- ⏳ 3日目の日記作成
- ⏳ Phase 1 振り返り・改善点リスト

---

### ドキュメント（完了）

- ✅ `PROJECT_OVERVIEW.md` - プロジェクト概要
- ✅ `TECHNICAL_SPEC.md` - 技術仕様書
- ✅ `README.md` - プロジェクト説明
- ✅ `.gitignore` - Git除外設定
- ✅ `IMPLEMENTATION_PLAN_v2.md` - 実装計画v2（Phase 1-5対応）★NEW
- ✅ `SETUP_v2.md` - セットアップガイドv2（Phase 1-5対応）★NEW
- ✅ `handoff-prompt-voice-diary.md` - 初期引継ぎプロンプト

---

## 📁 現在のプロジェクト構造

```
~/diary/
├── .git/                          ✅ 初期化済み（mainブランチ）
├── .gitignore                    ✅ 配置済み
├── PROJECT_OVERVIEW.md            ✅ 配置済み（要更新）
├── IMPLEMENTATION_PLAN_v2.md      ✅ 配置済み（最新版）
├── SETUP_v2.md                   ✅ 配置済み（最新版）
├── TECHNICAL_SPEC.md              ✅ 配置済み
├── README.md                     ✅ 配置済み（要更新推奨）
├── handoff-prompt-voice-diary.md ✅ 配置済み（初期版）
├── diaries/
│   └── 2026/02/
│       └── 2026-02-09.md         ✅ 作成済み（1日目）
├── docs/                         （空、Phase 2で作成）
├── images/                       （空、Phase 4で作成）
└── scripts/
    ├── diary-summarize.py        ✅ テスト済み・動作確認済み
    └── diary-push.sh             ✅ テスト済み・動作確認済み
```

---

## 🎯 実装計画（Phase 1〜5）

### Phase 1: 基本機能【85%完了】

**目標**: 手動テキスト入力 → Claude API整形 → GitHub保存

**残りタスク**:
1. 2日目の日記作成（10分）
2. 3日目の日記作成（10分）
3. Phase 1 振り返り（30分）

**実行コマンド**:
```bash
cd ~/diary
bash scripts/diary-push.sh "今日の日記内容..."
```

---

### Phase 2: Webフォーム＋スマホ音声入力【未着手】

**目標**: スマホから音声入力で日記を作成

**成果物**:
- `docs/index.html` - 日記一覧＋カレンダー
- `docs/diary-input.html` - 音声入力対応Webフォーム
- `docs/style.css` - レスポンシブCSS
- `docs/app.js` - メインロジック
- `docs/manifest.json` - PWA設定
- `docs/service-worker.js` - オフライン対応

**音声入力方式**:
1. **SuperWhisper**: 音声→テキスト変換アプリ → Webフォーム貼り付け
2. **Web Speech API**: ブラウザ標準機能（コスト$0、高精度）

**工数**: 12時間  
**コスト**: $0（SuperWhisper使用時は買い切りアプリ購入費）

---

### Phase 3: Ubuntu音声認識【未着手】

**目標**: Ubuntu環境でオフライン音声認識

**成果物**:
- `scripts/diary-voice.sh` - 音声入力モード
- Nerd Dictation + Vosk セットアップ

**技術**:
- Nerd Dictation（pipx経由でインストール）
- Voskエンジン（日本語モデル: vosk-model-small-ja-0.22）

**工数**: 4時間  
**コスト**: $0

---

### Phase 4: AI画像生成【未着手】

**目標**: DALL-E 3で日記から画像自動生成

**成果物**:
- `scripts/image-gen.py` - 画像生成スクリプト
- `diary-push.sh` 統合（画像生成オプション追加）

**技術**:
- DALL-E 3 API（OpenAI）
- 画像保存先: `images/YYYY-MM-DD.png`

**工数**: 8時間  
**コスト**: ~$0.04/枚（standard品質）、月30枚で約$1.2/月

---

### Phase 5: Instagram自動投稿【未着手】

**目標**: Instagram Graph APIで完全自動投稿

**成果物**:
- `scripts/instagram-post.py` - Instagram投稿スクリプト
- `diary-push.sh` 統合（Instagram投稿オプション追加）

**前提条件**:
- Meta開発者アカウント（無料）
- Instagramビジネスアカウント（無料）
- Facebookページ（無料）

**工数**: 10時間  
**コスト**: $0（API使用料無料）

---

## 💰 コスト見積もり

### 初期コスト

| 項目 | 価格 | 必須 |
|------|------|------|
| Meta開発者アカウント | $0 | Phase 5 |
| Instagramビジネスアカウント | $0 | Phase 5 |
| OpenAI APIアカウント | $0（初回$5クレジット） | Phase 4 |
| SuperWhisper（オプション） | 買い切り | Phase 2 |

---

### 月間ランニングコスト

| API | 用途 | 月30回使用時 |
|-----|------|-------------|
| Claude API | 日記整形 | ~$0.3 |
| DALL-E 3 | 画像生成 | ~$1.2 |
| Instagram Graph API | 投稿 | $0 |
| **合計** | | **~$1.5/月** |

**コスト削減オプション**:
- 画像生成スキップ → $0.3/月（Claude APIのみ）

---

## 🔑 環境情報

### 現在地

```bash
(diary-env) minori@minori-MacBookAir:~/diary$
```

---

### 環境変数

```bash
# 設定済み（~/.bashrc）
ANTHROPIC_API_KEY="sk-ant-api03-..."  # ✅ 動作確認済み
GITHUB_TOKEN="ghp_..."                # ✅ 動作確認済み

# Phase 4で追加予定
OPENAI_API_KEY="sk-proj-..."          # ⏳ 未設定

# Phase 5で追加予定
INSTAGRAM_ACCESS_TOKEN="..."          # ⏳ 未設定
INSTAGRAM_BUSINESS_ACCOUNT_ID="..."   # ⏳ 未設定
```

---

### Gitステータス

```bash
ブランチ: main
リモート: origin → git@github.com:Tanbe3170/my-voice-diary.git (SSH)
最新コミット: 8759336 - diary: 2026-02-09 - voice-diary実装開始
ローカル・リモート: 同期済み
```

---

### Python環境

```bash
仮想環境: ~/diary-env
Python: 3.10.7
パッケージ:
  - anthropic 0.79.0
  - PyYAML 6.0.3
  - requests 2.32.5
```

---

## 📚 重要なドキュメント

プロジェクトディレクトリ（`~/diary/`）に以下のドキュメントがあります：

### メインドキュメント

1. **IMPLEMENTATION_PLAN_v2.md** ★最重要
   - Phase 1-5 の詳細タスク
   - 実装コード例
   - 完了基準チェックリスト

2. **SETUP_v2.md** ★最重要
   - Phase 1-5 の実行手順（コマンド付き）
   - API設定の詳細手順
   - トラブルシューティング
   - FAQ

3. **PROJECT_OVERVIEW.md**
   - プロジェクト全体像
   - 技術スタック
   - フェーズ構成（要更新：Phase 1-4 → Phase 1-5）

4. **TECHNICAL_SPEC.md**
   - API仕様
   - プロンプト仕様
   - データモデル

5. **README.md**
   - プロジェクト説明
   - 基本的な使い方（要更新推奨）

---

## 🐛 既知の問題と解決済み事項

### 解決済み

**問題1: APIキー認証エラー**
- **原因**: クレジット残高不足
- **解決**: Anthropic Consoleでクレジット購入
- **現状**: 正常動作中

**問題2: 空ディレクトリがGitHubに反映されない**
- **理由**: Gitの仕様（空ディレクトリは追跡しない）
- **対応**: スクリプトが必要時に自動作成（`mkdir -p`）
- **現状**: 問題なし

---

### 注意事項

**YAML Front Matter の重要性**:
- Phase 2以降の機能（カレンダー、検索、画像生成、Instagram投稿）は、MarkdownファイルのYAML Front Matterに依存
- フォーマット変更時は慎重に

**コスト管理**:
- Claude API: 使用量に応じた従量課金
- DALL-E 3: $0.04/枚（standard品質）
- 月間予算を事前に設定推奨

---

## 🚀 次のチャットでの開始方法

### 新しいチャットの最初のメッセージ例

```
voice-diaryプロジェクトの開発を継続します。

【現在の状況】
- Phase 1が85%完了（残り2日分の日記作成）
- 音声入力とInstagram自動投稿を含むPhase 1-5の実装計画が完成

【参照ドキュメント】
- IMPLEMENTATION_PLAN_v2.md
- SETUP_v2.md

【次のアクション】
[以下から選択してください]

オプションA: Phase 1 を完了させる
→ 残り2日分の日記を作成し、振り返りを行う

オプションB: Phase 2（Webフォーム + 音声入力）を開始
→ GitHub Pages設定から始める

オプションC: Phase 3（Ubuntu音声認識）を開始
→ Nerd Dictationのセットアップから始める

オプションD: 特定の質問・相談
→ [具体的な質問を記載]

準備ができたら教えてください！
```

---

## 🎓 Claudeへの指示（重要）

### 基本方針

1. **初学者に優しいサポート**
   - コマンドの意味を詳しく説明
   - エラーメッセージの読み方を教える
   - なぜそうするのか（理由）を明示
   - 代替手段も提示

2. **段階的な進め方**
   - 各ステップで期待される結果を明示
   - 確認コマンドを提示
   - エラー時のトラブルシューティング案内

3. **ドキュメント活用**
   - 疑問があれば該当ドキュメントを参照
   - ユーザーにも参照場所を明示

4. **コードは動くものを優先**
   - 理論よりも実装
   - テストで動作確認
   - 段階的にリファクタリング

---

## 📊 進捗状況サマリー

| Phase | タスク | 状態 | 完了日 |
|-------|--------|------|--------|
| Phase 0 | 環境構築 | ✅ 完了 | 2025-02-09 |
| Phase 1 | GitHubリポジトリ設定 | ✅ 完了 | 2025-02-09 |
| Phase 1 | スクリプトテスト | ✅ 完了 | 2025-02-09 |
| Phase 1 | 1日目の日記作成 | ✅ 完了 | 2025-02-09 |
| Phase 1 | 2日目の日記作成 | ⏳ 未完了 | - |
| Phase 1 | 3日目の日記作成 | ⏳ 未完了 | - |
| Phase 1 | 振り返り | ⏳ 未完了 | - |
| Phase 2 | 設計 | ✅ 完了 | 2025-02-09 |
| Phase 2 | 実装 | ⏳ 未着手 | - |
| Phase 3 | 設計 | ✅ 完了 | 2025-02-09 |
| Phase 3 | 実装 | ⏳ 未着手 | - |
| Phase 4 | 設計 | ✅ 完了 | 2025-02-09 |
| Phase 4 | 実装 | ⏳ 未着手 | - |
| Phase 5 | 設計 | ✅ 完了 | 2025-02-09 |
| Phase 5 | 実装 | ⏳ 未着手 | - |

**全体進捗**: Phase 1（85%完了）

---

## 🎯 優先度と推奨順序

### 推奨実装順序

1. **Phase 1 完了**（残り1時間）← 最優先
   - 残り2日分の日記作成
   - 振り返り・改善点リスト

2. **Phase 2 実装**（12時間）← 推奨
   - 最も実用的（スマホから音声入力）
   - コスト$0（SuperWhisper除く）
   - GitHub Pagesで閲覧可能に

3. **Phase 4 実装**（8時間）
   - 見栄えが大幅に向上
   - コスト: ~$1.2/月

4. **Phase 3 実装**（4時間）← オプション
   - Ubuntu環境でのみ使用
   - オフライン動作可能

5. **Phase 5 実装**（10時間）← 最終目標
   - Instagram自動投稿
   - コスト$0

---

## ✅ Phase 1 完了基準チェックリスト

- [x] GitHubリポジトリが作成された
- [x] ローカルに `~/diary` としてクローン済み
- [x] `diary-summarize.py` が正常動作
- [x] `diary-push.sh` が正常動作
- [x] GitHubで日記ファイルが確認できる
- [x] Markdownファイルが正しくフォーマットされている
- [ ] **3日分の実日記が作成された**（残り2日）
- [ ] **改善点がリストアップされた**

---

## 🔄 最近の変更（2025年2月9日）

1. ✅ IMPLEMENTATION_PLAN_v2.md 作成
   - Phase 1-5 の詳細計画
   - 音声入力（スマホ + Ubuntu）対応
   - Instagram Graph API完全自動投稿対応

2. ✅ SETUP_v2.md 作成
   - Phase 1-5 の実行手順
   - API設定の詳細ガイド
   - トラブルシューティング拡充

3. ⏳ PROJECT_OVERVIEW.md 要更新
   - Phase 1-4 → Phase 1-5
   - 月間コスト見積もり更新

4. ⏳ README.md 要更新推奨
   - Phase 2-5 の機能概要追加

---

## 📝 よくある質問（FAQ）

### Q1: どのPhaseから始めるべきですか？

**A**: 以下の順序を推奨：
1. Phase 1 完了（残り2日分の日記）
2. Phase 2 実装（Webフォーム、最も実用的）
3. Phase 4 実装（画像生成）
4. Phase 3 実装（Ubuntu音声認識、オプション）
5. Phase 5 実装（Instagram投稿）

---

### Q2: コストを抑えるには？

**A**: 以下の構成で月額$0.3：
- Phase 1-3 のみ実装
- Phase 4（画像生成）をスキップ
- Phase 5（Instagram投稿）は無料

---

### Q3: プライベートリポジトリでも動作しますか？

**A**: 
- Phase 1-4: 問題なし
- Phase 5（Instagram投稿）: 画像の公開URLが必要なため、リポジトリをPublicにする必要あり
  - 代替案: 画像を別のホスティングサービスにアップロード

---

### Q4: 音声認識の精度は？

**A**:
- Web Speech API: ⭐⭐⭐⭐⭐（Google Speech Recognition）
- SuperWhisper: ⭐⭐⭐⭐⭐（Whisper AI）
- Nerd Dictation + Vosk: ⭐⭐⭐（軽量モデル）

---

## 🎉 プロジェクトのゴール

### 最終的な使用フロー

```
[朝]
スマホでSuperWhisper起動
  ↓
音声で日記を話す（1分）
  ↓
Webフォームに貼り付け
  ↓
「保存」ボタンをタップ
  ↓
[自動処理]
  - Claude APIで整形
  - GitHubに保存
  - DALL-E 3で画像生成
  - Instagramに自動投稿
  ↓
[完了]
スマホに通知が届く
```

**所要時間**: 約2分（音声入力含む）  
**月間コスト**: 約$1.5

---

## 📞 サポート情報

### トラブルシューティング

問題が発生した場合：
1. **SETUP_v2.md** のトラブルシューティングセクションを確認
2. エラーメッセージの全文をコピー
3. 実行したコマンドを記録
4. 新しいチャットで質問

---

### 参考リンク

- [Claude API Documentation](https://docs.anthropic.com/)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [OpenAI DALL-E 3](https://platform.openai.com/docs/guides/images)
- [Nerd Dictation](https://github.com/ideasman42/nerd-dictation)
- [Vosk Speech Recognition](https://alphacephei.com/vosk/)

---

**作成日**: 2025年2月9日  
**バージョン**: 3.0（Phase 1-5 完全版）  
**次回更新**: Phase 1 完了時または Phase 2 開始時  
**プロジェクト進捗**: Phase 1 85%完了

---

## 🚀 次のアクションを選択してください

新しいチャットで以下のいずれかを選択してください：

**[ ] オプションA**: Phase 1 を完了させる  
**[ ] オプションB**: Phase 2（Webフォーム + 音声入力）を開始  
**[ ] オプションC**: Phase 3（Ubuntu音声認識）を開始  
**[ ] オプションD**: 特定の質問・相談  

準備ができたら教えてください！
