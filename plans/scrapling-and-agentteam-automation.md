---
created: "2026-03-22"
status: approved
codex-review: ok (4回反復で収束)
scope: infrastructure
---

# 実装計画: Scrapling自動活用 + エージェントチーム自動作成

## 概要

2つの仕組みを導入し、Claude Codeの調査・計画策定能力を恒久的に強化する。

### 要件①: Scrapling MCPツールの自動活用
Scrapling MCPサーバー（`/home/minori/.claude/.mcp.json`に登録済み）のツール群を、ユーザーの明示的指示がなくてもリサーチ時に自動的に使用する仕組みを整備する。

### 要件②: エージェントチーム自動作成
調査・プラン作成等の複雑なタスクにおいて、エージェントチームを自動的に作成・活用する行動パターンを永続的に設定する。

## 現状分析

### 既存インフラ
| 項目 | 状態 | 場所 |
|------|------|------|
| Scrapling MCP | ✅ 登録済み | `/home/minori/.claude/.mcp.json` |
| エージェントチーム機能 | ✅ 有効 | `/home/minori/.claude/settings.json` env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| エージェント定義 | ✅ 4体定義済み | `.agent/researcher.md`, `implementer.md`, `diary-creator.md`, `idea-capture.md` |
| ExecPlanフレームワーク | ✅ 運用中 | `.agent/PLANS.md` |
| プロジェクトメモリ | ✅ 運用中 | `/home/minori/.claude/projects/-home-minori-diary/memory/` |

### ギャップ
1. **Scrapling使用指示が未設定** — MCPツールは登録されているが、いつ・どう使うかの指示がどこにもない
2. **Scrapling MCPツールの権限が未設定** — `permissions.allow`に未追加のため、使用時に毎回権限プロンプトが表示される
3. **エージェントチーム作成の判断基準が未設定** — チーム作成は手動トリガーのみ、自動判断ルールがない
4. **researcherエージェントがScraplingを認識していない** — `.agent/researcher.md`にWebスクレイピングツールの記載なし

## 実装計画

### Phase 1: Scrapling自動活用の仕組み（3ファイル変更）

#### 1-1. グローバルCLAUDE.mdにScraplingルールを追加
**対象**: `/home/minori/.claude/CLAUDE.md`（新規作成）

グローバルCLAUDE.mdはリポジトリ問わず読み込まれるため、ここにScraplingツールの使用ガイドラインを記述する。

```markdown
# グローバル指示

## Webリサーチツール: Scrapling MCP

Scrapling MCPサーバーが利用可能です（/home/minori/.claude/.mcp.json で設定済み）。
以下の場面で**ユーザーの指示を待たずに**積極的に使用してください。

### 自動使用するべき場面
- 技術調査（ライブラリ、API仕様、ドキュメント確認）
- エラー調査（スタックトレースやエラーコードからの情報収集）
- 競合・市場調査
- 外部サービスの最新仕様確認
- セットアップ手順の確認・検証

### ツール選択ガイド（優先順位付きフロー）
1. **WebSearch** — まず検索クエリで情報源を特定
2. **WebFetch** — 特定URLのテキスト取得で十分な場合（軽量・高速）
3. **Scrapling `get`** — HTML構造の解析、CSS選択による要素抽出、テーブル/リストのパースが必要な場合
4. **Scrapling `fetch`** — JS描画が必要なSPA/動的コンテンツの場合（PlayWright経由）
5. **Scrapling `stealthy_fetch`** — CloudFlare等の高保護サイトの場合
6. **`bulk_*` 系** — 複数ページの一括取得が必要な比較調査・網羅的調査

### 使用上の注意
- 上記の優先順位に従い、軽量なツールで十分なら上位を使う
- レート制限を意識し、同一ドメインへの連続アクセスは間隔を空ける
```

#### 1-2. `/home/minori/.claude/settings.json` にScrapling MCPツールの権限を追加
**対象**: `/home/minori/.claude/settings.json`

Scrapling MCPツールが権限プロンプトなしで自動実行されるよう、既存の`permissions.allow`配列にエントリを追記する。

**マージ規則**: 既存の`permissions.allow`配列の末尾にappendする。既に存在するエントリは重複追加しない。他のキー（env, enabledPlugins等）は一切変更しない。

**unified diff（実ファイルベース、対象: `/home/minori/.claude/settings.json` L20付近）:**
※ diffヘッダの `a/`・`b/` プレフィックスはGit慣例の相対表記。実対象は上記絶対パス。
```diff
--- a/home/minori/.claude/settings.json
+++ b/home/minori/.claude/settings.json
@@ -18,7 +18,13 @@
       "WebFetch(domain:www.detailedpedia.com)",
       "WebFetch(domain:naturalsciences.org)",
-      "Bash(python -m pytest test_build_image_prompt.py test_generate_image.py -v --tb=short)"
+      "Bash(python -m pytest test_build_image_prompt.py test_generate_image.py -v --tb=short)",
+      "mcp__scrapling__get",
+      "mcp__scrapling__bulk_get",
+      "mcp__scrapling__fetch",
+      "mcp__scrapling__bulk_fetch",
+      "mcp__scrapling__stealthy_fetch",
+      "mcp__scrapling__bulk_stealthy_fetch"
     ],
```

**適用後の検証コマンド:**
```bash
jq . /home/minori/.claude/settings.json > /dev/null && echo "JSON valid" || echo "JSON broken"
```

**注意**: 実装時にMCPツール名の正確なプレフィックスを確認する。MCPサーバー名`scrapling`に基づき`mcp__scrapling__<tool>`の形式を想定するが、実際のツール名はセッション開始時のMCPツール一覧で検証すること。ツール名が異なる場合は実測値に合わせる。

#### 1-3. researcherエージェントにScrapling活用指示を追加
**対象**: `/home/minori/diary/.agent/researcher.md`

researcherエージェントの「役割」セクションにScraplingツールの活用を明記し、調査時に自動的に利用するよう指示する。

**追加内容:**
```markdown
## 利用可能なリサーチツール

### Scrapling MCP
Webスクレイピング・構造化データ抽出に特化したMCPツール群:
- `get` / `bulk_get`: 静的サイトの取得・解析
- `fetch` / `bulk_fetch`: JS描画が必要なサイト（PlayWright経由）
- `stealthy_fetch` / `bulk_stealthy_fetch`: 高保護サイト

調査時のツール選択はグローバルCLAUDE.mdの優先順位フローに従う:
WebSearch → WebFetch → Scrapling get → Scrapling fetch → stealthy_fetch
```

### Phase 2: エージェントチーム自動作成の仕組み（2ファイル変更）

#### 2-1. グローバルCLAUDE.mdにチーム自動作成ルールを追加
**対象**: `/home/minori/.claude/CLAUDE.md`（Phase 1で作成したファイルに追記）

```markdown
## エージェントチーム自動作成ルール

以下の条件を満たすタスクでは、**ユーザーの指示を待たずに**エージェントチームを作成して作業を進めてください。

### 自動作成すべき場面
1. **リサーチタスク**: 技術調査、API仕様調査、競合調査など、複数ソースからの情報収集が必要な場合
2. **プラン作成**: 実装計画、設計文書、移行計画など、調査→分析→文書化のワークフローが発生する場合
3. **複数ファイルにまたがる実装**: 5ファイル以上の変更が見込まれる機能実装・リファクタリング
4. **レビュー＋修正**: codex-review後の修正が複数箇所に及ぶ場合

### チーム構成テンプレート

**ロール解決ルール**: `.agent/`に定義済みのエージェント名はカスタムエージェントとして使用。未定義のロールはClaude Code組み込みのsubagent_type（Explore, Plan, general-purpose）で代替する。

#### リサーチ系タスク
```
TeamCreate → info-gatherer(Explore) + analyst(Plan)
```
- info-gatherer: Scrapling/WebSearch/WebFetchで情報収集（subagent_type: Explore）
- analyst: 収集情報の分析・構造化・レポート作成（subagent_type: Plan）

#### プラン作成系タスク
```
TeamCreate → info-gatherer(Explore) + plan-writer(Plan)
```
- info-gatherer: 現状調査・技術調査（subagent_type: Explore）
- plan-writer: 調査結果をもとに計画書を構造化（subagent_type: Plan）

#### 実装系タスク（ExecPlan連携）
```
TeamCreate → implementer(.agent/implementer) + validator(general-purpose)
```
- implementer: コード実装（.agent/implementer.md定義を使用）
- validator: テスト実行・品質確認（subagent_type: general-purpose）

### 自動作成しない場面
- 単一ファイルの軽微な修正
- 既知の情報での質問応答
- 1ステップで完了する作業
```

#### 2-2. ExecPlanフレームワークにチーム連携を追記
**対象**: `/home/minori/diary/.agent/PLANS.md`

ExecPlanワークフローにエージェントチーム作成ステップを組み込む。

**変更内容:**
```markdown
## 使い方
1. エージェントチームを作成（TeamCreate）
2. `plans/` に計画書を作成（info-gatherer + plan-writer連携）
3. codex-review skillでレビュー
4. サブエージェントに実装を委任（implementer + validator連携）
5. テスト実行で品質確認

## ロール解決
- `.agent/`に定義済み: implementer, researcher, diary-creator, idea-capture
- 未定義ロール: Explore, Plan, general-purpose等の組み込みsubagent_typeを使用
```

### Phase 3: メモリ・永続化（3ファイル）

#### 3-1. feedbackメモリ: エージェントチーム活用の行動指針
**対象**: `/home/minori/.claude/projects/-home-minori-diary/memory/feedback_agentteam_usage.md`

```markdown
---
name: エージェントチーム自動作成の行動指針
description: 調査・計画策定時にエージェントチームを自動作成するルール
type: feedback
---

調査やプラン作成などの複雑なタスクでは、ユーザーの指示を待たずにエージェントチーム(TeamCreate)を作成して並列に作業を進める。

**Why:** ユーザーが毎回「エージェントチームを作成して」と指示する手間を省き、効率的なワークフローを実現するため。2026-03-22にユーザーから明示的に要望。

**How to apply:** リサーチ、プラン作成、5ファイル以上の実装、レビュー後の複数修正の際にTeamCreateを自動実行。単一ファイル修正や簡単な質問応答では不要。
```

#### 3-2. referenceメモリ: Scrapling MCPの設定情報
**対象**: `/home/minori/.claude/projects/-home-minori-diary/memory/reference_scrapling_mcp.md`

```markdown
---
name: Scrapling MCPサーバー設定
description: Webスクレイピング用Scrapling MCPの設定場所とツール一覧
type: reference
---

Scrapling MCPサーバーがグローバル設定で有効。リポジトリ問わず利用可能。

- 設定ファイル: `/home/minori/.claude/.mcp.json`
- 実行バイナリ: `/home/minori/diary-env/bin/scrapling`
- バージョン: 0.4.2（pip install済み、venv: /home/minori/diary-env）
- ツール: get, bulk_get, fetch, bulk_fetch, stealthy_fetch, bulk_stealthy_fetch
- 権限: `/home/minori/.claude/settings.json` の permissions.allow に登録済み
- 用途: WebFetch/WebSearchでは不十分な場合の詳細Web調査・HTML解析
```

#### 3-3. MEMORY.mdへインデックス追記
**対象**: `/home/minori/.claude/projects/-home-minori-diary/memory/MEMORY.md`

以下の2行を追記する:

```markdown
## ツール・自動化設定
- [Scrapling MCPサーバー設定](reference_scrapling_mcp.md) - Webスクレイピング用MCPの設定場所とツール一覧
- [エージェントチーム自動作成の行動指針](feedback_agentteam_usage.md) - 調査・計画策定時にチームを自動作成するルール
```

## 変更ファイルサマリー

| # | ファイル（絶対パス） | 操作 | Phase | 対応手順 |
|---|----------|------|-------|---------|
| 1 | `/home/minori/.claude/CLAUDE.md` | 新規作成 | 1, 2 | 1-1, 2-1 |
| 2 | `/home/minori/.claude/settings.json` | 編集（permissions.allow配列へappend） | 1 | 1-2 |
| 3 | `/home/minori/diary/.agent/researcher.md` | 編集 | 1 | 1-3 |
| 4 | `/home/minori/diary/.agent/PLANS.md` | 編集 | 2 | 2-2 |
| 5 | `/home/minori/.claude/projects/-home-minori-diary/memory/feedback_agentteam_usage.md` | 新規作成 | 3 | 3-1 |
| 6 | `/home/minori/.claude/projects/-home-minori-diary/memory/reference_scrapling_mcp.md` | 新規作成 | 3 | 3-2 |
| 7 | `/home/minori/.claude/projects/-home-minori-diary/memory/MEMORY.md` | 編集（インデックス追加） | 3 | 3-3 |

## リスク・注意事項

1. **グローバルCLAUDE.mdの影響範囲**: 全リポジトリに適用されるため、diary以外のプロジェクトにも影響する。ただし要件②「リポジトリ問わず」がユーザーの意図であり、これは意図通り。
2. **チーム自動作成の過剰発動**: 単純タスクでもチームが作られるとオーバーヘッドが増える。「自動作成しない場面」を明記して抑制する。
3. **Scraplingのvenv依存**: `/home/minori/diary-env` のvenvに依存している。環境が変わった場合にMCPサーバーが起動しなくなるリスク。メモリに記録して将来の参照に備える。
4. **MCPツール名の検証**: `mcp__scrapling__<tool>`形式は想定であり、実装時にセッション開始後のツール一覧で正確な名前を確認する必要がある。

## テスト計画

本計画はインフラ設定変更であり、コードテスト（npm test）の対象外。以下の実測ベースの検証を行う。

**証跡管理**: 各検証の結果はClaude Codeセッションのトランスクリプトに自動記録される（`/home/minori/.claude/projects/-home-minori-diary/sessions/`配下）。追加の証跡ファイルは作成しない。

### 検証1: Scrapling MCPツールの権限設定
**実行**: 新セッション起動後、「httpbin.orgのHTMLを取得して」と依頼
**観測ログ**: セッショントランスクリプト内のツール呼び出し記録
**合格行パターン**: ツール呼び出し `mcp__scrapling__get` が権限プロンプトなしで実行される（ユーザーのApprove操作なし）
**成功判定**: Scraplingツール（get等）が権限確認なしで実行完了し、HTTPステータス200が返る
**失敗時切り分け**:
- 権限プロンプトが出る → `jq '.permissions.allow' /home/minori/.claude/settings.json` でツール名を確認し修正
- ツール自体が見えない → `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | timeout 5 /home/minori/diary-env/bin/scrapling mcp` でMCPサーバー起動を確認

### 検証2: Scrapling自動使用
**実行**: 新セッションで「Scraplingライブラリの最新APIを調査して」と依頼（Scraplingツール使用の指示は出さない）
**観測ログ**: セッショントランスクリプト内のツール呼び出し一覧
**合格行パターン**: `mcp__scrapling__get` または `mcp__scrapling__fetch` がツール呼び出しに含まれる
**成功判定**: ユーザーの明示的指示なしでScraplingツールが使用される
**失敗時切り分け**:
- WebFetch/WebSearchのみ使用 → `/home/minori/.claude/CLAUDE.md`が読み込まれているかセッション冒頭の`claudeMd`セクションで確認。読み込まれていればツール選択ガイドの優先度を調整
- ツールが一切使われない → `/home/minori/.claude/CLAUDE.md`のファイル存在と内容を確認

### 検証3: エージェントチーム自動作成
**実行**: 新セッションで「Vercel Edge Functionsの技術調査をして報告書にまとめて」と依頼（チーム作成の指示は出さない）
**観測ログ**: セッショントランスクリプト内のTeamCreate呼び出しとAgent spawn記録
**合格行パターン**: `TeamCreate` ツール呼び出しが記録され、`Agent` ツールでinfo-gathererまたはanalyst名のエージェントが起動される
**成功判定**: ユーザーの明示的指示なしでTeamCreateが実行される
**失敗時切り分け**:
- チームが作られない → `/home/minori/.claude/CLAUDE.md`のチーム自動作成ルールの条件文を確認。条件が厳しすぎる場合は閾値を調整
- チーム構成が異なる → テンプレートの記述を修正

### 検証4: 既存テスト（補助）
**実行**: `npm test`
**観測ログ**: ターミナル出力（テスト結果サマリー行）
**合格行パターン**: `Tests  XX passed` （failed = 0）
**成功判定**: 実行時点の全テストがpass（コード変更なしのため件数変動なし）
**失敗時切り分け**: 本計画の変更はコードに影響しないため、失敗時は既存の問題
