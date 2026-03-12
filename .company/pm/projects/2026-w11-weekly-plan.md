---
created: "2026-03-12"
project: "恐竜日記拡張 - 週間実装計画"
status: in-progress
tags: [週間計画, dino-evo-sim, キャラクター, 日記拡張]
week: "2026-W11 (3/12〜3/18)"
---

# 週間実装計画: 2026-W11 (3/12 木〜3/18 水)

## 今週のゴール
dino-evo-simの動作確認を完了し、恐竜日記の最初の1本を作成できる状態にする。

---

## Day 1: 3/12 (木) — 基盤構築 + skill検証

### 午前 ✅ 完了
- [x] 仮想カンパニー組織構築
- [x] サブエージェント配置（.agent/）
- [x] アイデア蓄積環境の整備
- [x] skill現状調査（dino-evo-sim / dinoresearch-ai）

### 午後〜夜 🔄 進行中
- [ ] dino-evo-sim E2Eテスト（別ウィンドウで実行中）
  - Python環境 + requirements.txt インストール
  - GOOGLE_API_KEY / OPENAI_API_KEY 確認
  - Phase 1〜5 の通しテスト
- [ ] E2Eテスト結果を `.company/research/topics/` に記録

---

## Day 2: 3/13 (金) — 恐竜日記テンプレート設計

### 目標: dino-evo-simの出力を日記フォーマットに変換する設計

- [ ] dino-evo-sim Phase 5レポートの出力構造を分析
- [ ] 恐竜日記テンプレートを設計
  - 通常日記フォーマットとの互換性確保
  - image_prompt フィールドの統合方法
  - SNSキャプション生成ルール（300 graphemes / 500文字）
- [ ] テンプレートを `.company/engineering/docs/dino-diary-template.md` に保存
- [ ] diary-creator エージェント（.agent/diary-creator.md）の恐竜モード仕様を更新

### 部署: 開発 + PM

---

## Day 3: 3/14 (土) — 恐竜日記 第1号作成

### 目標: 実際にdino-evo-simで恐竜を進化させ、日記として投稿

- [ ] dino-evo-simで恐竜1種を選んでシミュレーション実行
- [ ] レポート → 日記フォーマットに手動変換（初回は手動でフロー確認）
- [ ] 画像生成（Gemini or DALL-E 3）
- [ ] voice-diary APIで日記投稿テスト
- [ ] SNS投稿テスト（Bluesky / Threads）
- [ ] フロー全体の課題・改善点を `.company/engineering/debug-log/` に記録

### 部署: 開発 + マーケ

---

## Day 4: 3/15 (日) — オリジナルキャラクター構想

### 目標: キャラクター設定の方向性を決める

- [ ] キャラクターの壁打ちセッション（秘書室で実施）
  - どんなキャラ？（恐竜系？マスコット？）
  - 性格・口調
  - ビジュアルの方向性
- [ ] vision-to-prompt / art-style-replicator でキャラデザイン案を生成
- [ ] 3案程度に絞り込み、`.company/marketing/content-plan/character-design.md` に保存
- [ ] キャラクターのimage_prompt基本テンプレートを作成

### 部署: マーケ + クリエイティブ（秘書代行）

---

## Day 5: 3/16 (月) — リサーチ投稿機能の設計

### 目標: 日記APIを拡張してリサーチ内容も投稿可能にする設計

- [ ] 現行create-diary APIの仕様レビュー
- [ ] リサーチ投稿用の拡張方針を決定
  - 方式A: 既存APIにtypeパラメータ追加（diary / research）
  - 方式B: 新規API（create-research.js）を作成
- [ ] 設計書を `.company/engineering/docs/research-post-design.md` に作成
- [ ] codex-review でレビュー

### 部署: 開発

---

## Day 6: 3/17 (火) — 自動化・統合

### 目標: 恐竜日記の作成フローを半自動化

- [ ] dino-evo-sim → 日記変換の自動化スクリプト or エージェント連携
- [ ] キャラクター決定版のimage_promptを確定
- [ ] 恐竜日記 第2号を半自動フローで作成
- [ ] 改善点の洗い出し

### 部署: 開発 + PM

---

## Day 7: 3/18 (水) — 週次レビュー + 来週計画

### 目標: 今週の成果を振り返り、来週の計画を立てる

- [ ] 週次レビュー実施 → `reviews/2026-W11.md`
- [ ] 各部署の成果まとめ
- [ ] 来週（W12）の計画策定
- [ ] ブロッカー・課題の整理

### 部署: 秘書室 + PM

---

## リスク・ブロッカー

| リスク | 影響 | 対策 |
|--------|------|------|
| dino-evo-sim E2Eテスト不合格 | Day 2以降が遅延 | 手動でPhaseごとに分解テスト |
| GOOGLE_API_KEY未設定 | Gemini画像生成不可 | DALL-E 3フォールバック使用 |
| codex exec 動作不安定 | Phase 3 AI議論が失敗 | 手動検証で代替 |
| キャラデザインが決まらない | Day 5以降に影響 | 仮キャラで進行、後で差し替え |

## 成功基準
- [ ] dino-evo-simが正常動作する
- [ ] 恐竜日記を最低1本投稿できる
- [ ] キャラクターの方向性が決まる
- [ ] リサーチ投稿機能の設計書が完成する
