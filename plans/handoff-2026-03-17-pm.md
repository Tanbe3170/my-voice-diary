# セッション引き継ぎ資料（2026-03-17 14:20）

## 完了した作業

### コミット: `bcda663` (main, pushed)
全231テスト通過（168→231、+63テスト）

| 作業 | 内容 | ファイル |
|------|------|---------|
| Plan 1 Phase 6a | create-diary.jsに恐竜モード追加（mode/dinoContext、プロンプト3分岐、ファイルパスサフィックス） | api/create-diary.js, tests/create-diary-dino.test.js |
| Plan 2 Phase A | キャラクター基盤（character.js lib、image-backend.js lib、quetz-default.json） | api/lib/character.js, api/lib/image-backend.js, characters/quetz-default.json, tests/character.test.js, tests/image-backend.test.js |
| 共通 filePath | generate-image.js + SNS 3APIにfilePath対応 + パストラバーサル防止 | api/generate-image.js, api/post-*.js, tests/*.test.js |

---

## 次のアクション（優先順）

### 1. Plan 2 Phase A 統合（generate-image.jsにキャラクター+フォールバック統合）
- `api/generate-image.js` に character.js / image-backend.js を統合
- characterId パラメータ追加 → キャラクター設定読み込み → プロンプト合成 → フォールバックチェーンで画像生成
- テスト追加（tests/generate-image.test.js に5テスト）
- **依存**: `npm install` で @google/genai をインストールしてからテスト

### 2. Plan 2 Phase B（create-diary.jsにキャラクター注入）
- characterId パラメータ追加
- Claudeプロンプトにキャラクター設定注入（injectCharacterPrompt使用）
- レスポンスにcharacterIdを含める

### 3. Plan 1 Phase 6b（フロントエンドUI）
- diary-input.htmlにモード選択タブUI追加
- 恐竜日記モード / リサーチ日記モード用の入力フォーム

### 4. Plan 2 Phase C-D（フロントエンド + SNS連携）
- キャラクター選択UI
- SNSキャプションにキャラクター情報反映

### 5. codex-review
- 全実装完了後に実施

---

## 環境設定メモ（出先PC用）

```bash
# リポジトリ取得
git pull origin main

# 依存インストール（@google/genaiが新規追加）
npm install

# テスト実行（231テスト通過を確認）
npm test

# 新しい環境変数（Vercelにも設定必要）
# GOOGLE_API_KEY      - Gemini NB2/NBpro画像生成用
# GEMINI_NB2_MODEL    - NB2モデルID上書き（任意）
# GEMINI_NBPRO_MODEL  - NBproモデルID上書き（任意）
```

---

## 再開プロンプト

```
前回のセッション（2026-03-17 14:20）の続きです。

## 状況
- コミット bcda663 で Plan1 恐竜日記モード + Plan2 キャラクター基盤 + 共通filePath対応を実装済み
- 全231テスト通過

## 今回やりたいこと
1. Plan 2 Phase A統合: generate-image.jsにcharacter.js + image-backend.jsを統合
2. Plan 2 Phase B: create-diary.jsにキャラクター注入
3. Plan 1 Phase 6b: フロントエンドモード選択UI
4. 完了後codex-review

## 参照
- plans/idea-1-dino-diary-system.md
- plans/idea-2-original-character-diary.md
- plans/handoff-2026-03-17-pm.md
```
