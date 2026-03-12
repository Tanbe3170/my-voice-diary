---
created: "2026-03-12"
topic: "dino-evo-sim / dinoresearch-ai skill現状調査"
status: completed
tags: [dino-evo-sim, dinoresearch-ai, skill調査]
---

# 調査: dino-evo-sim / dinoresearch-ai skill現状評価

## 目的
voice-diary恐竜日記拡張の基盤となる2つのskillの実装状態と活用可能性を評価する。

---

## 1. dino-evo-sim

### 所在
`C:\Users\STEP\.claude\skills\dino-evo-sim\`

### 実装状態: 完成度高い

#### ワークフロー（5 Phase）
1. **Phase 1**: 恐竜種選定（AskUserQuestion、代表10種）
2. **Phase 2**: 学術リサーチ（dino-research skill呼び出し）
3. **Phase 3**: AI議論（Claude vs Codex、最大5ラウンド合意形成）
4. **Phase 4**: 画像生成プロンプト生成 + 画像生成
5. **Phase 5**: レポート出力

#### 主要ファイル
- `SKILL.md` - 565行の詳細仕様書（完成度非常に高い）
- `scripts/build_image_prompt.py` - JSON→画像プロンプト変換
- `scripts/generate_image.py` - 画像生成（Gemini NB2/Pro デフォルト、DALL-E フォールバック）
- `references/debate-protocol.md` - AI議論プロトコル
- `references/evolution-pressures.md` - 進化圧力カタログ
- `assets/evolution-report-template.md` - レポートテンプレート
- `assets/debate-log-template.md` - 議論ログテンプレート

#### 特徴
- 2つのシミュレーションモード: Academic（学術的）/ Creative（創造的）
- マルチAI出力: DALL-E / Midjourney / Stable Diffusion / Gemini
- Codex検証によるエビデンスベースの合意形成
- フォールバック機構: Gemini NB2 → NB Pro → DALL-E 3

#### 依存関係
- Python 3 + requirements.txt
- GOOGLE_API_KEY（Gemini画像生成、デフォルト）
- OPENAI_API_KEY（DALL-E 3、フォールバック）
- codex exec コマンド（Phase 3のAI議論）

---

## 2. dinoresearch-ai

### 所在
`C:\Users\STEP\.claude\skills\dinoresearch-ai\`

### 実装状態: Webアプリ（React/TypeScript）

#### 構成
- React + TypeScript + Vite ビルドシステム
- Gemini API連携（`services/geminiService.ts`）
- UI コンポーネント: CredibilityBadge, EvidencePanel, Layout, StatusIndicator
- データ型定義（`types.ts`, `data.ts`）

#### 主要ファイル
- `App.tsx` - メインアプリ
- `components/` - UIコンポーネント群
- `services/geminiService.ts` - Gemini API呼び出し
- `package.json` - npm依存関係
- `metadata.json` - skill メタデータ

#### 特徴
- エビデンスパネルで研究の信頼性を可視化
- リサーチ結果の構造化表示

---

## 結論

### dino-evo-sim
- **活用可能性: 高い** - SKILL.mdが非常に詳細で、そのまま実行可能
- **日記連携のポイント**: Phase 5のレポート出力を日記フォーマットに変換すれば、恐竜日記として投稿可能
- **画像生成**: Phase 4の画像生成をvoice-diaryの既存DALL-E 3連携と統合可能

### dinoresearch-ai
- **活用可能性: 中** - 独立したWebアプリだが、リサーチ結果のデータ構造が参考になる
- **日記連携のポイント**: リサーチ結果をMarkdown形式に変換して日記投稿に活用

### voice-diary連携の技術的課題
1. dino-evo-simはPython、voice-diaryはNode.js → API境界の設計が必要
2. 画像生成の統合（既存DALL-E 3パイプライン vs dino-evo-simのGemini優先パイプライン）
3. レポート→日記フォーマット変換の自動化
4. SNS投稿用キャプション生成（300 graphemes / 500文字制限）

---

## ネクストアクション
- [ ] dino-evo-simを実際に実行して動作確認
- [ ] Python環境のセットアップ確認（requirements.txt）
- [ ] GOOGLE_API_KEY の設定確認
- [ ] レポート→日記フォーマット変換の設計
- [ ] オリジナルキャラクター設定の検討開始
