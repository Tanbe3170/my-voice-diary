# 恐竜プロジェクト群 統合実装 引き継ぎ資料

> 作成日: 2026-03-29
> 更新日: 2026-04-03
> 前セッション: Phase 3 ExecPlan 作成完了

---

## 最新セッション（2026-04-03）で完了したこと

1. **Phase 3 ExecPlan 作成** — `owl-encyclopedia/plans/phase3-react-fe-exec.md`
   - Phase 3a: React FE MVP（データ閲覧UI、6セッション）
   - Phase 3b: AI実行UI（Gemini連携、3セッション）
   - 全11ステップ、47ファイル、9セッション見積もり
2. **owl-encyclopedia FE 調査** — frontend/（空）、Backend API（18エンドポイント完了）、dinoresearch-ai移植元確認
3. **Phase 2 手動テストとの独立性確認** — パレオアート手動テストとPhase 3は完全独立（別リポジトリ・別機能）

## 過去セッションで完了したこと

1. **3プロジェクトの全体調査** — diary, owl-encyclopedia, what-if の構造・API・DB・スキルを横断調査
2. **統合実装計画書の策定** — DB設計、API設計、FE設計、プロジェクト間連携、デプロイ戦略を含む詳細計画
3. **Codex レビュー（ok: true まで3回反復）** — blocking 5件 + advisory 4件を全解消
4. **工数見積もり + 進捗管理表の追加** — 全13-18セッション、Phase別タスク分解
5. **各プロジェクトへの計画書配置** — 3リポジトリの `plans/cross-project-integration-plan.md`

---

## 計画書の場所

| プロジェクト | ファイル | 用途 |
|-------------|---------|------|
| owl-encyclopedia | `plans/cross-project-integration-plan.md` | 全体統合計画 |
| owl-encyclopedia | `plans/phase3-react-fe-exec.md` | **Phase 3 ExecPlan（実装者向け）** |
| diary | `plans/cross-project-integration-plan.md` | diary視点の統合計画 |
| what-if | `plans/cross-project-integration-plan.md` | what-if視点の統合計画 |

---

## 次に実装すべきこと（Phase 3 — React FE）

### Phase 3a: React FE MVP（owl-encyclopedia、6セッション）

**ExecPlan:** `owl-encyclopedia/plans/phase3-react-fe-exec.md`

**開始前の確認事項:**
- owl-encyclopedia Backend が起動可能か（`./mvnw spring-boot:run`）
- Supabase DB接続情報（DB_HOST, DB_PASSWORD等）が手元にあるか
- Node.js 20+ がインストールされているか

**実装順序:**
1. `3a-1` Vite scaffold + Tailwind + shadcn/ui 基盤設定
2. `3a-2` 型定義 + API クライアント + カスタムフック
3. `3a-3` 共通レイアウト + React Router v7 ルーティング
4. `3a-4` 恐竜一覧ページ（フィルタ + ページネーション）
5. `3a-5` 恐竜詳細ページ（3タブ UI）
6. `3a-6` リサーチ記事一覧 + 詳細（Markdown レンダリング）
7. `3a-R` テスト + ビルド確認 + codex-review

### Phase 3b: AI 実行 UI（owl-encyclopedia、3セッション）

**実装順序:**
1. `3b-1` geminiService 移植（dinoresearch-ai → frontend/src/services/）
2. `3b-2` EvidencePanel/CredibilityBadge/StatusIndicator 移植
3. `3b-3` ResearchRunnerPage + JWT認証付き保存機能
4. `3b-R` テスト + 統合確認 + codex-review

### 重要な設計決定（ExecPlan で確定済み）

| 項目 | 決定内容 |
|------|---------|
| スタック | React 19 + TypeScript + Vite 6 + Tailwind v4 + shadcn/ui |
| テーマ | "Paleontology Lab" — ダークベース(slate-900) + シアン(cyan-500) + emerald |
| API通信 | fetch ネイティブ（追加依存なし）、カスタムフックで状態管理 |
| Gemini連携 | @google/genai v1.38+、gemini-3-flash-preview + gemini-2.5-flash-image |
| 移植元 | `/home/minori/MyApp/dinoresearch-ai/`（3コンポーネント + geminiService） |
| テスト | Vitest + React Testing Library + MSW（Backend モック） |
| Phase 2 独立性 | Phase 2（diary連携）は未着手だが Phase 3 と完全独立。並行実装可能 |

### 完了済み Phase

| Phase | 状態 | 備考 |
|-------|------|------|
| Phase 1: DB拡張 + API | ✅ 完了 | owl-encyclopedia 18エンドポイント稼働 |
| Phase 2: diary連携 | ⬜ 未着手 | Phase 3 と独立、並行可能 |

---

## 全Phase概要（13-18セッション）

```
Phase 1: DB拡張 + API（owl-encyclopedia）    4-5セッション  ✅ 完了
Phase 2: diary連携                           2-3セッション  ⬜ 未着手
Phase 3a: React FE MVP                      6セッション    ⬜ ExecPlan作成済
Phase 3b: AI実行UI                          3セッション    ⬜ ExecPlan作成済
Phase 4: what-if統合                         2-3セッション  ⬜ 未着手
```

---

## 注意事項

- 各Phase完了後に必ず `codex-review` を実行すること（ok: trueまで反復）
- 進捗は計画書内の「工数見積もり＆進捗管理」テーブルを更新すること（⬜→🔵→✅）
- owl-encyclopedia の CLAUDE.md に記載のコーディングパターンに従うこと（record DTO, static from(), @PrePersist等）
