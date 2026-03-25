---
paths:
  - "**/*.js"
  - "**/*.mjs"
---
# JavaScript コーディングスタイル

## イミュータビリティ（必須）
- 既存オブジェクトを変更せず、新しいオブジェクトを作成
- スプレッド演算子を使用

## ファイル構成
- 高凝集・低結合
- 200-400行が目安、800行が上限
- 機能/ドメイン単位で整理

## エラーハンドリング
- async/awaitとtry-catchを使用
- ユーザー向けには分かりやすいメッセージ
- サーバー側では詳細なコンテキストをログ
- エラーを黙って飲み込まない

## 入力バリデーション
- システム境界で必ず検証
- 外部データ（APIレスポンス、ユーザー入力）を信頼しない
- 早期失敗と明確なエラーメッセージ

## JSDoc（推奨）
- 公開APIにはJSDocで型情報を記述
- @param, @returns を活用

```javascript
/**
 * @param {{ firstName: string, lastName: string }} user
 * @returns {string}
 */
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`;
}
```

## console.log禁止
- 本番コードではconsole.logを使わない
- console.warn, console.errorは適切に使用

## コード品質チェックリスト
- [ ] 関数は50行未満
- [ ] ファイルは800行未満
- [ ] ネストは4レベル以内
- [ ] 適切なエラーハンドリング
- [ ] ハードコード値なし（定数や環境変数を使用）
- [ ] イミュータブルなパターン
