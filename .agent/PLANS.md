# ExecPlan ガイド

## ExecPlanとは
複雑な機能実装やリファクタリングを、設計から実装まで体系的に管理するフレームワーク。

## 使い方
1. `plans/` に計画書を作成
2. codex-review skillでレビュー
3. サブエージェントに実装を委任
4. テスト実行で品質確認

## サブエージェント一覧
- `researcher.md` - 調査・分析エージェント
- `implementer.md` - 実装エージェント
- `diary-creator.md` - 日記作成特化エージェント
- `idea-capture.md` - アイデアキャプチャエージェント
