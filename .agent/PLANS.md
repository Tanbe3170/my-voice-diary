# ExecPlan ガイド

## ExecPlanとは
複雑な機能実装やリファクタリングを、設計から実装まで体系的に管理するフレームワーク。

## 使い方
1. エージェントチームを作成（TeamCreate）
2. `plans/` に計画書を作成（info-gatherer + plan-writer連携）
3. codex-review skillでレビュー
4. サブエージェントに実装を委任（implementer + validator連携）
5. テスト実行で品質確認

## ロール解決
- `.agent/`に定義済み: implementer, researcher, diary-creator, idea-capture
- 未定義ロール: Explore, Plan, general-purpose等の組み込みsubagent_typeを使用

## サブエージェント一覧
- `researcher.md` - 調査・分析エージェント
- `implementer.md` - 実装エージェント
- `diary-creator.md` - 日記作成特化エージェント
- `idea-capture.md` - アイデアキャプチャエージェント
