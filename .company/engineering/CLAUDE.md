# 開発

## 役割
技術ドキュメント、設計書、デバッグログを管理する。

## ルール
- 技術ドキュメントは `docs/topic-name.md`
- デバッグログは `debug-log/YYYY-MM-DD-issue-name.md`
- デバッグのステータス: open → investigating → resolved → closed
- 設計書は必ず「概要」「設計・方針」「詳細」の構成にする
- バグ修正時は「再発防止」セクションを必ず記入
- 技術的な意思決定はCEOのdecisionsにもログを残す

## voice-diary固有の知識
- Vercel Serverless Functions（Node.js ES Modules）
- API: create-diary, generate-image, post-instagram, post-bluesky, post-threads
- 認証: JWT (HS256) + AUTH_TOKENフォールバック
- レート制限: Upstash Redis（fail-closed原則）
- テスト: vitest（161テスト、6ファイル）
- 冪等性パターン: Redis SETNX/GETで重複投稿防止
- 画像圧縮: sharp（1MB超過時PNG→JPEG変換+リサイズ）

## フォルダ構成
- `docs/` - 技術ドキュメント・設計書
- `debug-log/` - デバッグ・バグ調査ログ
