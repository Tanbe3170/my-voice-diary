# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## プロジェクト概要

**voice-diary** - 音声入力から自動で日記を生成し、Vercel Serverless Functionで整形・保存、GitHub Pagesで閲覧できるシステム

**主要な技術スタック:**
- Node.js (ES Modules) - Vercel Serverless Functions
- Claude API (Anthropic) - 日記の口語→文語整形
- DALL-E 3 (OpenAI) - 日記イメージ画像生成
- sharp - Bluesky画像アップロード用圧縮（PNG→JPEG変換+リサイズ、唯一の本番依存）
- GitHub API - ファイル保存（日記Markdown + 画像）
- Upstash Redis - 永続レート制限（Serverless対応）
- JWT (HS256) - API認証（Node.js crypto）
- Vercel - ホスティング + Serverless Functions
- GitHub Pages - 静的サイト閲覧
- Web Speech API - ブラウザ音声認識
- vitest - テストフレームワーク

**開発フェーズ:**
- Phase 1: 基本機能（✅ 完了 - CLIスクリプト）
- Phase 2: Webインターフェース（✅ 完了 - GitHub Pages）
- Phase 2.5: Vercel移行 + セキュリティ強化（✅ 完了）
- Phase 3: 高品質音声認識（📅 計画あり - plans/参照）
- Phase 4: AI画像生成（✅ 完了 - DALL-E 3 + Vercel Serverless）
- Phase 5: Instagram投稿（✅ 完了 - Instagram Graph API + 冪等性保証）
- Phase 5.5: Bluesky + Threads投稿（✅ 完了 - AT Protocol + Threads API）

**最新の変更（2026-03-17）:**
- Bluesky画像自動圧縮（sharp導入、1MB超過時PNG→JPEG変換+リサイズ）
- sharp: 唯一の本番依存パッケージ（Bluesky 1MBアップロード制限対応）

**過去の変更（2026-02-22）:**
- Phase 5.5: Bluesky自動投稿API（post-bluesky.js）
- Phase 5.5: Threads自動投稿API（post-threads.js）
- Bluesky AT Protocol（createSession→uploadBlob→createRecord）
- Threads API（Container→Polling→Publish）
- 300 graphemes制限（Bluesky、Intl.Segmenter使用）
- 500文字制限（Threads）
- Redis冪等性パターン（bs_lock/bs_posted、th_lock/th_posted）
- フロントエンドBluesky/Threads投稿UI（diary-input.html）
- トークンリフレッシュスクリプト（refresh-threads-token.js）

---

## コミュニケーション設定

**言語:** すべての応答を日本語で行う
- コードの説明、エラーメッセージ、提案も日本語
- 思考プロセスや実行時の説明も日本語

**コーディング規約:**
- 変数名・関数名: 英語（キャメルケース） - 例: `clientIP`, `verifyJwt()`
- ファイル名: 英語（ハイフン区切り） - 例: `create-diary.js`, `generate-image.js`
- コメント: 日本語
- コミットメッセージ: 日本語OK、フォーマット: `<タイプ>: <説明>`

---

## 主要コマンド

### テスト実行

```bash
# 全テスト実行（168テスト）
npm test

# 特定テストファイル
npx vitest run tests/jwt.test.js
npx vitest run tests/create-diary-ratelimit.test.js
npx vitest run tests/generate-image.test.js
npx vitest run tests/post-instagram.test.js
npx vitest run tests/post-bluesky.test.js
npx vitest run tests/post-threads.test.js
```

### JWT生成（管理者用）

```bash
# デフォルト24時間有効のJWT生成
node scripts/generate-jwt.js

# 有効期間を指定（時間単位、1〜168）
node scripts/generate-jwt.js 48
```

### Webアプリの確認

```bash
# ローカルプレビュー
start docs/index.html
start docs/diary-input.html

# 本番URL
# https://my-voice-diary.vercel.app/
# https://my-voice-diary.vercel.app/diary-input.html
```

### Git操作

```bash
git status
git log --oneline -5
git pull origin main
git push origin main
```

### レガシースクリプト（Phase 1）

```bash
# Python仮想環境有効化
source ~/diary-env/bin/activate

# 日記作成（CLI版）
bash scripts/diary-push.sh "今日の出来事をここに入力..."

# 日記整形のみ（JSON出力）
python3 scripts/diary-summarize.py "今日の出来事をここに入力..."
```

---

## アーキテクチャ

### システム全体のデータフロー

```
[入力] 音声/テキスト（ブラウザ）
  ↓
[API] POST /api/create-diary
  - JWT認証（+ AUTH_TOKENフォールバック）
  - Upstash Redisレート制限（30req/日/IP）
  - Claude API呼び出し（口語→文語変換）
  - GitHub APIでMarkdown保存
  - imageToken生成（HMAC-SHA256）
  ↓
[API] POST /api/generate-image（任意）
  - imageToken認証（HMAC、5分有効）
  - Upstash Redisレート制限（10req/日/IP）
  - DALL-E 3で画像生成
  - GitHub APIで画像保存
  - Base64プレビュー返却（2.5MB閾値ガード）
  ↓
[API] POST /api/post-instagram（任意）
  - JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
  - Upstash Redisレート制限（5req/日/IP）
  - 重複投稿防止（Redis SETNX/GET、冪等性保証）
  - Instagram Graph API（Container→Polling→Publish）
  - 動的タイムアウト（25秒デッドライン）
  ↓
[API] POST /api/post-bluesky（任意）
  - JWT認証（JWTのみ）
  - Upstash Redisレート制限（3req/日/IP）
  - 重複投稿防止（Redis SETNX/GET、冪等性保証）
  - AT Protocol（createSession→uploadBlob→createRecord）
  - 300 graphemes制限（Intl.Segmenter）
  ↓
[API] POST /api/post-threads（任意）
  - JWT認証（JWTのみ）
  - Upstash Redisレート制限（3req/日/IP）
  - 重複投稿防止（Redis SETNX/GET、冪等性保証）
  - Threads API（Container→Polling→Publish）
  - 500文字制限
  ↓
[閲覧] Vercel (docs/)
  - index.html: 日記一覧（GitHub API経由）
  - diary-input.html: 音声入力 + 日記作成 + SNS投稿UI
```

### ディレクトリ構造

```
voice-diary/
├── api/                        # Vercel Serverless Functions
│   ├── create-diary.js         # 日記作成API（Claude整形 + GitHub保存）
│   ├── generate-image.js       # 画像生成API（DALL-E 3 + GitHub保存）
│   ├── post-instagram.js       # Instagram投稿API（Graph API + 冪等性保証）
│   ├── post-bluesky.js         # Bluesky投稿API（AT Protocol + 冪等性保証）
│   └── post-threads.js         # Threads投稿API（Threads API + 冪等性保証）
│
├── lib/                        # 共通ライブラリ（Vercel関数カウント対象外）
│   ├── cors.js                 # CORS共通ユーティリティ
│   ├── jwt.js                  # JWT署名・検証（HS256、外部依存ゼロ）
│   ├── character.js            # キャラクターシステム
│   ├── image-backend.js        # 画像生成バックエンド（フォールバックチェーン）
│   ├── image-styles.js         # 画像スタイル定義
│   └── image-token.js          # HMAC画像トークン生成・検証
│
├── scripts/                    # 管理・自動化スクリプト
│   ├── generate-jwt.js         # 管理者用JWT生成CLI
│   ├── refresh-instagram-token.js  # Instagramトークンリフレッシュ
│   ├── refresh-threads-token.js    # Threadsトークンリフレッシュ
│   ├── diary-summarize.py      # Phase 1: Claude API日記整形
│   └── diary-push.sh           # Phase 1: GitHub自動push
│
├── tests/                      # テストスイート（vitest）
│   ├── jwt.test.js             # JWT生成・検証テスト（23テスト）
│   ├── create-diary-ratelimit.test.js  # レート制限テスト（12テスト）
│   ├── generate-image.test.js  # 画像生成APIテスト（11テスト）
│   ├── post-instagram.test.js  # Instagram投稿APIテスト（31テスト）
│   ├── post-bluesky.test.js    # Bluesky投稿APIテスト（41テスト）
│   └── post-threads.test.js    # Threads投稿APIテスト（40テスト）
│
├── docs/                       # フロントエンド（Vercel静的配信）
│   ├── index.html              # 日記一覧ページ
│   ├── diary-input.html        # 音声入力 + 日記作成フォーム
│   ├── app.js                  # フロントエンドロジック
│   ├── style.css               # レスポンシブCSS
│   ├── manifest.json           # PWAマニフェスト
│   ├── service-worker.js       # オフライン対応
│   └── images/                 # AI生成画像
│       └── YYYY-MM-DD.png
│
├── diaries/                    # 日記ファイル（Markdown）
│   └── YYYY/MM/YYYY-MM-DD.md
│
├── plans/                      # 実装計画書
│
├── package.json                # Node.js設定（type: module, vitest）
├── IMPLEMENTATION_PLAN.md      # 詳細実装計画（全Phase）
├── PHASE_2.5_GUIDE.md          # Vercel移行計画
├── PROJECT_OVERVIEW.md         # プロジェクト概要
└── TECHNICAL_SPEC.md           # 技術仕様書
```

### 日記ファイルのフォーマット

```markdown
---
title: "日記のタイトル"
date: YYYY-MM-DD
tags: [#タグ1, #タグ2, #タグ3]
image_prompt: "AI画像生成用の英語プロンプト"
---

# 日記のタイトル

## YYYY-MM-DD

### サマリー

3行でまとめた要約

---

詳細な本文（段落分け）

---

**Tags:** #タグ1 #タグ2 #タグ3
```

---

## セキュリティ設計

### JWT認証（2段階移行）

**現在: 第1段階（JWT優先 + AUTH_TOKENフォールバック）**

```
リクエスト → X-Auth-Tokenヘッダ取得
  ↓
verifyJwt() 成功 かつ sub === 'diary-admin' → 認証OK
  ↓ 失敗
AUTH_TOKEN一致 → 認証OK + console.warn('レガシー認証使用')
  ↓ 不一致
401 Unauthorized
```

**JWT検証仕様（lib/jwt.js）:**
- alg固定: HS256のみ（alg: none攻撃防止）
- exp必須: 数値型、`exp > now - 60`
- nbf検証: 存在する場合 `nbf <= now + 60`
- iat検証: 存在する場合 `iat <= now + 60`
- 型検証: exp/nbf/iat非数値 → 拒否
- 署名検証: timingSafeEqual（タイミング攻撃防止）
- clock skew: ±60秒許容
- sub検証: create-diary.jsで `sub === 'diary-admin'` をチェック

**第2段階（後日）:** Go条件を満たした後にAUTH_TOKENフォールバックを削除

### レート制限（Upstash Redis）

両APIで同一パターン（INCR + EXPIRE、fail-closed設計）:

| API | キー | 制限 | TTL |
|-----|------|------|-----|
| create-diary | `diary_rate:{IP}:{YYYY-MM-DD}` | 30req/日 | 86400秒 |
| generate-image | `img_rate:{IP}:{YYYY-MM-DD}` | 10req/日 | 86400秒 |
| post-instagram | `ig_rate:{IP}:{YYYY-MM-DD}` | 5req/日 | 86400秒 |
| post-bluesky | `bs_rate:{IP}:{YYYY-MM-DD}` | 3req/日 | 86400秒 |
| post-threads | `th_rate:{IP}:{YYYY-MM-DD}` | 3req/日 | 86400秒 |

**fail-closed原則:** Upstash障害時は課金処理（Claude/DALL-E）に進まず500を返す

**TTL原子性:** INCR後にEXPIRE失敗 → TTL確認 → ttl > 0のみ成功とみなし、それ以外は500

### CORS

`lib/cors.js`で許可オリジンを管理:
- `https://my-voice-diary.vercel.app`（本番）
- `https://{VERCEL_URL}`（プレビュー）
- `null`（ローカル開発）

### 画像トークン（imageToken）

- create-diary.js成功時にHMAC-SHA256で発行
- 有効期限: 5分
- generate-image.jsで検証（date + timestamp + HMAC）

---

## 環境変数

### Vercel環境変数（本番）

| 変数名 | 用途 |
|--------|------|
| `JWT_SECRET` | JWT署名・検証キー（32バイト以上） |
| `AUTH_TOKEN` | レガシー認証（第2段階で削除予定） |
| `ANTHROPIC_API_KEY` | Claude API |
| `OPENAI_API_KEY` | DALL-E 3 API |
| `GITHUB_TOKEN` | GitHub Contents API |
| `GITHUB_OWNER` | GitHubリポジトリオーナー |
| `GITHUB_REPO` | GitHubリポジトリ名 |
| `IMAGE_TOKEN_SECRET` | 画像トークンHMACキー |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis認証トークン |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram Graph API長期トークン（60日有効） |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | InstagramビジネスアカウントID |
| `META_APP_ID` | MetaアプリID（トークンリフレッシュ用） |
| `META_APP_SECRET` | Metaアプリシークレット（リフレッシュ用） |
| `BLUESKY_IDENTIFIER` | Blueskyハンドル（例: user.bsky.social） |
| `BLUESKY_APP_PASSWORD` | Blueskyアプリパスワード |
| `THREADS_ACCESS_TOKEN` | Threads API長期トークン（60日有効） |
| `THREADS_USER_ID` | ThreadsユーザーID |

### ローカル開発（レガシーCLI用）

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export GITHUB_TOKEN="ghp_..."
```

---

## プロジェクト固有のルール

### API変更時の注意
- セキュリティ変更は必ずテストを追加
- fail-closed原則: 外部サービス障害時は安全側に倒す
- Upstashパターンはgenerate-image.jsを参照実装とする

### 画像生成
- DALL-E 3使用時はコストを事前に通知（$0.04/枚）
- 画像生成は任意（ユーザーの確認後）

### デプロイ
- Vercel: mainブランチへのpushで自動デプロイ
- 環境変数追加時はVercelダッシュボードで設定

---

## 開発フロー

1. **機能追加前**: 日本語で説明、計画書作成（plans/）
2. **実装中**: テスト駆動で進行（`npm test`で確認）
3. **実装後**: codex-reviewスキルでレビュー（ok: trueまで反復）
4. **デプロイ前**: 全テスト通過確認
5. **完了時**: 実行結果を日本語で報告

---

## 参考ドキュメント

- **詳細実装計画**: `IMPLEMENTATION_PLAN.md` - 全Phaseの実装手順
- **Vercel移行計画**: `PHASE_2.5_GUIDE.md` - Phase 2.5の詳細
- **技術仕様**: `TECHNICAL_SPEC.md` - API仕様、プロンプト設計
- **プロジェクト概要**: `PROJECT_OVERVIEW.md` - 開発の背景、目標
- **実装計画書**: `plans/` - 各実装のCodexレビュー済み計画

---

*最終更新: 2026年3月25日*
*現在のフェーズ: Phase 5.5 完了（Bluesky + Threads投稿機能追加 + Bluesky画像圧縮）*

---

## ECC（Everything Claude Code）コンポーネント

本プロジェクトで活用すべきECCエージェント・スキルの一覧。

### 推奨エージェント（自動使用）

| エージェント | 使用タイミング | 優先度 |
|-------------|---------------|--------|
| **code-reviewer** | コード変更後に即座にレビュー | HIGH |
| **security-reviewer** | 認証・入力処理・API変更時 | HIGH |
| **typescript-reviewer** | JS/TSファイル変更時のPRレビュー | HIGH |
| **tdd-guide** | 新機能開発時にテストファースト | HIGH |
| **build-error-resolver** | ビルド・テストエラー発生時 | MEDIUM |
| **architect** | アーキテクチャ変更・新機能設計時 | MEDIUM |
| **planner** | 複雑な実装計画の作成 | MEDIUM |
| **refactor-cleaner** | 不要コードの検出・削除 | LOW |

### 推奨スキル

| スキル | 使用場面 |
|--------|---------|
| **coding-standards** | コーディング規約の適用・確認 |
| **api-design** | 新しいAPIエンドポイント設計 |
| **backend-patterns** | ミドルウェア、キャッシュ、サービス層の設計 |
| **security-review** | デプロイ前のセキュリティ監査 |
| **tdd-workflow** | テスト駆動開発の実践 |
| **verification-loop** | PR作成前の品質ゲート |
| **claude-api** | Claude API連携パターン |
| **ai-regression-testing** | AI生成コードのリグレッション防止 |
| **cost-aware-llm-pipeline** | Claude/DALL-E APIコスト最適化 |

### プロジェクトルール（.claude/rules/）

| ルール | 内容 |
|--------|------|
| `coding-style.md` | JSコーディングスタイル、イミュータビリティ、JSDoc |
| `security.md` | セキュリティチェックリスト、プロジェクト固有の認証パターン |
| `testing.md` | vitest、TDD、モック対象、カバレッジ要件 |
| `development-workflow.md` | 開発フロー、リサーチ→計画→TDD→レビュー→コミット |

# Plan Creation

Whenever you create a markdown file in the ./plans directory, please make sure to have it reviewed by Codex using the codex-review skill.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

# Review gate (codex-review)
At key milestones—after updating specs/plans, after major implementation steps (≥5 files / public API / infra-config), and before commit/PR/release—run the codex-review SKILL and iterate review→fix→re-review until clean.

# Task Management

When implementing features or making code changes, use the Tasks feature to manage and track progress. Break down the work into clear steps and update task status as you proceed.

# Cross-Project Plan Synchronization

This project is part of a 3-project integration (owl-encyclopedia, diary, what-if). Each project has its own `plans/cross-project-integration-plan.md`.

**After any integration-related implementation or change affecting cross-project concerns:**
1. Update `plans/cross-project-integration-plan.md` in the current project
2. Update `plans/cross-project-integration-plan.md` in all affected sibling projects:
   - owl-encyclopedia: `/home/minori/workspace/owl-encyclopedia/plans/cross-project-integration-plan.md`
   - what-if: `/home/minori/workspace/what-if/plans/cross-project-integration-plan.md`
3. Update HANDOFF documents if they exist (`HANDOFF_CROSS_PROJECT.md`)

This ensures all projects stay in sync and no plan becomes stale.

# Other

When asking for a decision, use "AskUserQuestion".
