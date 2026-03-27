# 恐竜プロジェクト群 統合実装 引き継ぎ資料

> 作成日: 2026-03-27
> 前セッション: 統合実装計画の策定 + Codexレビュー完了

---

## 今回のセッションで完了したこと

1. **3プロジェクトの全体調査** — diary, owl-encyclopedia, what-if の構造・API・DB・スキルを横断調査
2. **統合実装計画書の策定** — DB設計、API設計、FE設計、プロジェクト間連携、デプロイ戦略を含む詳細計画
3. **Codex レビュー（ok: true まで3回反復）** — blocking 5件 + advisory 4件を全解消
4. **工数見積もり + 進捗管理表の追加** — 全13-18セッション、Phase別タスク分解
5. **各プロジェクトへの計画書配置** — 3リポジトリの `plans/cross-project-integration-plan.md`

---

## 計画書の場所

| プロジェクト | ファイル |
|-------------|---------|
| owl-encyclopedia | `plans/cross-project-integration-plan.md` |
| diary | `plans/cross-project-integration-plan.md` |
| what-if | `plans/cross-project-integration-plan.md` |

---

## 次に実装すべきこと（Phase 1 から開始）

### Phase 1: DB拡張 + API追加（owl-encyclopedia、4-5セッション）

**開始前の確認事項:**
- Supabase DB接続情報（DB_HOST, DB_PASSWORD等）が手元にあるか
- Docker Desktop が起動しているか（Testcontainers用）

**実装順序:**
1. `1-0` OpenAPI契約固定 + springdoc設定
2. `1-1` Flyway V4マイグレーション作成（3テーブル: dinosaur_researches, academic_papers, evolution_simulations）
3. `1-2` JPA Entity + Enum + Converter（8ファイル）
4. `1-3` Repository + Specification（6ファイル）
5. `1-4a-c` DTO + Service + Controller
6. `1-5` SecurityConfig + WebhookAuthenticationFilter（HMAC-SHA256）
7. `1-6` Contract Test + Testcontainers統合テスト
8. `1-R` codex-review

### 重要な設計決定（計画書で確定済み）

| 項目 | 決定内容 |
|------|---------|
| Webhook認証 | HMAC-SHA256署名（Admin JWT非共有）。canonical string: `timestamp + "." + body` |
| JSONB変換 | カスタムConverter: StringListConverter, JsonMapConverter |
| テスト戦略 | H2（高速単体）+ Testcontainers PostgreSQL（JSONB統合テスト、`@Tag("integration")`） |
| 重複防止 | evolution_simulations に `(scientific_name, simulation_mode)` UNIQUE制約 + API upsert |
| MVP範囲 | Phase 3a（データ閲覧のみ）が最小リリース。AI実行UIはPhase 3b |
| API契約 | 3段対応表（what-if JSON → DTO → DB）が計画書に確定済み |

---

## 全Phase概要（13-18セッション）

```
Phase 1: DB拡張 + API（owl-encyclopedia）    4-5セッション  ⬜
Phase 2: diary連携                           2-3セッション  ⬜
Phase 3a: React FE MVP                      3-4セッション  ⬜
Phase 3b: AI実行UI                          2-3セッション  ⬜
Phase 4: what-if統合                         2-3セッション  ⬜
```

---

## 注意事項

- 各Phase完了後に必ず `codex-review` を実行すること（ok: trueまで反復）
- 進捗は計画書内の「工数見積もり＆進捗管理」テーブルを更新すること（⬜→🔵→✅）
- owl-encyclopedia の CLAUDE.md に記載のコーディングパターンに従うこと（record DTO, static from(), @PrePersist等）
