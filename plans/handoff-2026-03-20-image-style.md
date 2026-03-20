# 引き継ぎ資料: 画像生成スタイル強化

## 作成日時
2026-03-20 15:00 JST

## 概要
日記の画像生成システムに「スタイル選択機能」と「内容伝達力の向上」を追加する実装計画を策定・レビュー完了。実装は別チャットで行う。

## 完了した作業
1. 現行システムの徹底リサーチ（画像生成フロー、プロンプト構成、キャラクターシステム、HMAC署名）
2. 既存日記のimage_prompt傾向分析（8件）
3. DALL-E 3/Gemini NB2のスタイル制御ベストプラクティス調査
4. 実装計画書作成: `plans/image-style-enhancement.md`
5. Codex archレビュー 4反復で収束（ok: true）

## 計画の要点

### 機能1: スタイル選択
- **illustration**: フラットイラスト調（太い輪郭線、シンプルな形状、限定カラーパレット）
- **oilpainting**: 油絵調（厚塗り筆跡、濃厚色彩、キャンバス質感）
- デフォルト画像生成バックエンド: **NB2（Gemini 3.1 Flash Image Preview）**
- Gemini APIにはstyleパラメータがないため、プロンプト内テキストでスタイル制御

### 機能2: 内容伝達力の向上
- Claudeへのimage_prompt生成指示を強化（抽象的比喩→具体的ワンシーン）
- 各スタイルごとのClaudeInstruction注入

### セキュリティ設計
- **styleId必須契約**: create-diary/generate-image両APIで必須パラメータ（デフォルト補完なし）
- **HMAC署名拡張**: `date:filePath:characterId:mode:styleId:timestamp`
- **HMAC計算共通化**: `api/lib/image-token.js` に切り出し（API間の署名不一致を構造的に排除）
- **verifyImageToken**: fail-closed設計（形式検証→timestamp→hex/長さ→TTL→timingSafeEqual）
- **getStyle()**: 未知styleIdはnull返却（フォールバックなし）
- **isValidStyleId()**: ホワイトリスト検証

## 変更ファイル一覧（13ファイル）

### 新規（4ファイル）
| ファイル | 概要 |
|---------|------|
| `api/lib/image-styles.js` | スタイル定義（illustration / oilpainting） |
| `api/lib/image-token.js` | HMAC署名生成・検証共通ユーティリティ |
| `tests/image-styles.test.js` | スタイル定義テスト |
| `tests/image-token.test.js` | HMAC契約テスト（API間署名整合性保証） |

### 修正（9ファイル）
| ファイル | 概要 |
|---------|------|
| `api/create-diary.js` | styleId受信、Claudeプロンプト強化、HMAC生成をimage-token.jsに委譲 |
| `api/generate-image.js` | styleId受信・検証、HMAC検証をimage-token.jsに委譲 |
| `api/lib/character.js` | composeImagePrompt()にstyleId引数追加 |
| `docs/diary-input.html` | スタイル選択UI追加、create-diary/generate-image両方にstyleId追加 |
| `docs/js/build-image-request.js` | styleIdフィールド追加（常に明示的に含める） |
| `tests/character.test.js` | スタイル対応のプロンプト合成テスト追加 |
| `tests/generate-image.test.js` | styleId関連テスト追加 |
| `tests/build-image-request.test.js` | styleIdフィールドテスト追加 |
| `tests/create-diary-dino.test.js` | styleId対応のHMAC署名テスト追加 |

## 実装順序
1. `api/lib/image-styles.js` 新規作成 + テスト
2. `api/lib/image-token.js` 新規作成 + 契約テスト
3. `api/lib/character.js` の `composeImagePrompt()` 改修 + テスト
4. `api/create-diary.js` 改修 + テスト
5. `api/generate-image.js` 改修 + テスト
6. `docs/js/build-image-request.js` 改修 + テスト
7. `docs/diary-input.html` UI追加
8. 全テスト実行 + codex-review

## Codexレビューメモ（実装時の注意点）
- API実コードで `styleId` 未検証経路から `getStylePromptPrefix()` / `getStyleNegativePrompt()` / `getStyleClaudeInstruction()` が直接呼ばれないこと（null参照で500化防止）
- `buildTokenPayload()` のJSDocブロックを1つに統合すること
- styleId必須契約がフロントエンド→API→HMAC署名の全レイヤで一貫していること

## 参照ドキュメント
- 実装計画書: `plans/image-style-enhancement.md`（Codex archレビュー済み）
- サンプル画像: `/home/minori/ピクチャ/PteroSample.jpeg`（フラットイラスト調の参考）
