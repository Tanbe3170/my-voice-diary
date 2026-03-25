# 開発ワークフロー

## 機能実装フロー

0. **リサーチ＆再利用**（実装前に必須）
   - 既存コードベースを検索（lib/にユーティリティがないか確認）
   - ライブラリドキュメントを確認（Context7やベンダードキュメント）
   - 車輪の再発明を避ける

1. **計画**
   - plannerエージェントで実装計画を作成
   - plans/ディレクトリに計画書を保存
   - 依存関係とリスクを特定

2. **TDD**
   - tdd-guideエージェントを使用
   - テストファースト（RED → GREEN → IMPROVE）
   - 80%以上のカバレッジ

3. **コードレビュー**
   - code-reviewerエージェントで即座にレビュー
   - CRITICALとHIGHの問題を修正
   - codex-reviewスキルでok: trueまで反復

4. **コミット＆プッシュ**
   - フォーマット: `<タイプ>: <説明>`
   - タイプ: feat, fix, refactor, docs, test, chore, perf
   - mainブランチへのpushでVercel自動デプロイ

## fail-closed原則
- 外部サービス障害時は安全側に倒す
- Upstashパターンはgenerate-image.jsを参照実装

## ビルドエラー時
1. build-error-resolverエージェントを使用
2. エラーメッセージを分析
3. 段階的に修正
4. 修正ごとに検証
