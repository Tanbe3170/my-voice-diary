# Company - 仮想組織管理システム

## オーナープロフィール

- **事業・活動**: 個人開発（voice-diary: 音声入力日記システム）
- **ミッション**: プロダクト完成・スキルアップ・ポートフォリオ充実・収益化
- **言語**: 日本語
- **作成日**: 2026-03-12

## 組織構成

```
.company/
├── CLAUDE.md
├── secretary/
│   ├── CLAUDE.md
│   ├── _template.md
│   ├── inbox/
│   │   └── _template.md
│   ├── todos/
│   │   ├── _template.md
│   │   └── 2026-03-12.md
│   └── notes/
│       └── _template.md
├── ceo/
│   ├── CLAUDE.md
│   └── decisions/
│       └── _template.md
├── reviews/
│   └── _template.md
├── pm/
│   ├── CLAUDE.md
│   ├── _template.md
│   ├── projects/
│   │   └── _template.md
│   └── tickets/
│       └── _template.md
├── research/
│   ├── CLAUDE.md
│   ├── _template.md
│   └── topics/
│       └── _template.md
├── engineering/
│   ├── CLAUDE.md
│   ├── _template.md
│   ├── docs/
│   │   └── _template.md
│   └── debug-log/
│       └── _template.md
└── marketing/
    ├── CLAUDE.md
    ├── _template.md
    ├── content-plan/
    │   └── _template.md
    └── campaigns/
        └── _template.md
```

## 組織図

```
━━━━━━━━━━━━━━━━━━━━
  オーナー（あなた）
━━━━━━━━━━━━━━━━━━━━
         │
    ┌────┴────┐
    │  CEO    │
    └────┬────┘
         │
  ┌──────┼──────┬──────┬──────┐
  │      │      │      │      │
秘書室   PM  リサーチ  開発  マーケ
```

## 各部署の役割

| 部署 | フォルダ | 説明 |
|------|---------|------|
| 秘書室 | secretary | 窓口・相談役。TODO管理、壁打ち、クイックメモ。常設。 |
| CEO | ceo | 意思決定・部署振り分け。常設。 |
| レビュー | reviews | 週次・月次レビュー。常設。 |
| PM | pm | プロジェクト進捗、マイルストーン、チケット管理。voice-diaryの各Phase管理。 |
| リサーチ | research | 技術調査、API調査、新機能の事前調査。 |
| 開発 | engineering | 技術ドキュメント、設計書、デバッグログ。voice-diaryの技術資産蓄積。 |
| マーケティング | marketing | SNS戦略（Instagram/Bluesky/Threads）、ポートフォリオ発信、収益化企画。 |

## 運営ルール

### 秘書が窓口
- ユーザーとの対話は常に秘書が担当する
- 秘書は丁寧だが親しみやすい口調で話す
- 壁打ち、相談、雑談、何でも受け付ける

### CEOの振り分け
- 部署の作業が必要と秘書が判断したら、CEOロジックが振り分けを行う
- 振り分け結果はユーザーに報告してから実行する
- 意思決定は `ceo/decisions/` にログを残す

### ファイル命名規則
- **日次ファイル**: `YYYY-MM-DD.md`
- **トピックファイル**: `kebab-case-title.md`
- **テンプレート**: `_template.md`（各フォルダに1つ、変更しない）
- **レビュー**: 週次 `YYYY-WXX.md`、月次 `YYYY-MM.md`

### TODO形式
```markdown
- [ ] タスク内容 | 優先度: 高/通常/低 | 期限: YYYY-MM-DD
- [x] 完了タスク | 優先度: 通常 | 完了: YYYY-MM-DD
```

### コンテンツルール
1. 迷ったら `secretary/inbox/` に入れる
2. 新規ファイルは `_template.md` をコピーして使う
3. 既存ファイルは上書きしない（追記のみ）
4. 追記時はタイムスタンプを付ける
5. 1トピック1ファイルを守る

### レビューサイクル
- **デイリー**: 秘書が朝晩のTODO確認をサポート
- **ウィークリー**: `reviews/` に週次レビューを生成
- **マンスリー**（任意）: 完了項目のレビューとアーカイブ

## パーソナライズメモ

- **困りごと**: タスク管理が散らかる、リサーチが中途半端、アイデアを忘れる、継続が苦手
- **プロジェクト状況**: voice-diary Phase 5.5まで完了（Bluesky + Threads投稿機能）
- **技術スタック**: Node.js, Vercel Serverless, Claude API, DALL-E 3, GitHub API, Upstash Redis
- **SNS連携**: Instagram Graph API, Bluesky AT Protocol, Threads API
- **他skillとの連携**: 今後、他のClaude Codeスキルも活用して拡大予定
