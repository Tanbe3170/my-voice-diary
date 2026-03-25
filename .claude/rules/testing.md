---
paths:
  - "tests/**/*.js"
  - "api/**/*.js"
  - "lib/**/*.js"
---
# テスト要件

## テストフレームワーク: vitest
- 実行: `npm test` または `npx vitest run`
- 個別: `npx vitest run tests/<filename>.test.js`

## 最低テストカバレッジ: 80%

## テスト種別（すべて必須）
1. **ユニットテスト** - 個別関数、ユーティリティ（lib/）
2. **統合テスト** - APIエンドポイント（api/）
3. **セキュリティテスト** - JWT、レート制限、入力検証

## TDD（テスト駆動開発）ワークフロー
1. テストを先に書く（RED）
2. テスト実行 → 失敗を確認
3. 最小限の実装（GREEN）
4. テスト実行 → 成功を確認
5. リファクタリング（IMPROVE）
6. カバレッジ確認（80%以上）

## モック対象
- 外部API: Claude API, DALL-E 3, Gemini API
- GitHub API
- Upstash Redis
- Instagram/Bluesky/Threads API

## テストパターン（AAA）
```javascript
test('説明的なテスト名', async () => {
  // Arrange - 準備
  const input = { /* ... */ };

  // Act - 実行
  const result = await targetFunction(input);

  // Assert - 検証
  expect(result).toBe(expected);
});
```

## エージェントサポート
- **tdd-guide**エージェントを新機能開発時にプロアクティブに使用
- **code-reviewer**エージェントで実装後に即座にレビュー
