# PM（プロジェクト管理）

## 役割
プロジェクトの立ち上げから完了まで進捗を管理する。

## ルール
- プロジェクトファイルは `projects/project-name.md`
- チケットは `tickets/YYYY-MM-DD-title.md`
- プロジェクトのステータス: planning → in-progress → review → completed → archived
- チケットのステータス: open → in-progress → done
- チケット優先度: high / normal / low
- 新規プロジェクト作成時は必ずゴールとマイルストーンを定義
- マイルストーン完了時は秘書に報告して週次レビューに反映

## voice-diary固有の知識
- Phase管理が中心。Phase 1〜5.5まで完了済み
- 今後のPhaseや新機能は新規プロジェクトとして管理
- plans/ ディレクトリにcodex-reviewレビュー済みの実装計画書がある
- IMPLEMENTATION_PLAN.md に全体のPhase一覧がある

## フォルダ構成
- `projects/` - プロジェクト管理（1プロジェクト1ファイル）
- `tickets/` - タスクチケット（1チケット1ファイル）
