# 恐竜プロジェクト群 統合実装計画書
## diary 視点

> 作成日: 2026-03-27
> 対象: diary (Vercel Serverless + GitHub Pages)
> 関連: owl-encyclopedia, what-if

---

## 概要

diary のリサーチ機能で作成された構造化データを owl-encyclopedia の PostgreSQL DB に自動保存し、恐竜図鑑との双方向連携を実現する。diary の既存機能に影響を与えない fail-open 設計。

---

## 外部依存条件

本計画書は diary リポジトリ内の変更のみを対象とする。以下は owl-encyclopedia 側で事前に実装されている必要がある。

| 条件 | owl-encyclopedia 側の対応 |
|------|--------------------------|
| Webhookエンドポイント | `POST /api/v1/webhooks/diary-research` が稼働していること |
| HMAC署名検証 | `X-Webhook-Signature` / `X-Webhook-Timestamp` によるHMAC-SHA256検証が実装されていること |
| 共有シークレット | diary と owl-encyclopedia で同一の `OWL_WEBHOOK_SECRET` が設定されていること |

---

## diary側の変更点

### 変更1: owl-api クライアント新規作成

**ファイル:** `lib/owl-api.js`

owl-encyclopedia Webhook にリサーチデータを送信する関数。既存の lib/ パターン（cors.js, jwt.js 等）に従う。認証はHMAC-SHA256署名方式を使用する。

```javascript
// lib/owl-api.js
import crypto from 'node:crypto';

export async function sendToOwlEncyclopedia(researchData, sourceUrl) {
    const OWL_API_URL = process.env.OWL_API_URL;
    const OWL_WEBHOOK_SECRET = process.env.OWL_WEBHOOK_SECRET;

    if (!OWL_API_URL || !OWL_WEBHOOK_SECRET) {
        console.warn('OWL_API環境変数が未設定のため、図鑑連携をスキップ');
        return null;
    }

    try {
        const body = JSON.stringify({ ...researchData, sourceUrl });
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = crypto
            .createHmac('sha256', OWL_WEBHOOK_SECRET)
            .update(timestamp + '.' + body)
            .digest('hex');

        const res = await fetch(`${OWL_API_URL}/api/v1/webhooks/diary-research`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Timestamp': timestamp,
                'X-Webhook-Signature': signature
            },
            body,
            signal: AbortSignal.timeout(8000) // Vercel 10秒制限対策
        });
        return res.ok ? await res.json() : null;
    } catch (err) {
        console.warn('owl-encyclopedia連携エラー（無視）:', err.message);
        return null;
    }
}
```

### 変更2: create-research.js への統合

**ファイル:** `api/create-research.js`

GitHub push 成功後（L530付近）、レスポンス返却前に owl-api.js を呼び出す:

```javascript
import { sendToOwlEncyclopedia } from '../lib/owl-api.js';

// GitHub push成功後に実行
const githubFileUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${filePath}`;
try {
    await sendToOwlEncyclopedia(researchData, githubFileUrl);
} catch (owlError) {
    console.warn('owl-encyclopedia連携エラー（無視）:', owlError.message);
}
```

**設計原則:**
- fail-open: owl-encyclopedia連携の失敗は create-research 全体を失敗させない
- タイムアウト8秒: Vercel Hobbyプランの10秒制限に余裕を持たせる
- 環境変数未設定時はスキップ: 開発環境でも安全に動作

### 変更3: diary-input.html URL パラメータ対応

**ファイル:** `docs/diary-input.html`

owl-encyclopedia フロントエンドからのリンク遷移時、リサーチタブ + カテゴリ + トピックをプリフィルする:

```javascript
// URL例: /diary-input.html?type=research&category=dinosaur&topic=Velociraptor
const urlParams = new URLSearchParams(window.location.search);
const typeParam = urlParams.get('type');
const categoryParam = urlParams.get('category');
const topicParam = urlParams.get('topic');

if (typeParam === 'research') {
    switchContentType('research');
    if (categoryParam) document.getElementById('research-category').value = categoryParam;
    if (topicParam) document.getElementById('research-topic').value = topicParam;
}
```

### 変更4: 環境変数追加

Vercel Dashboard に以下を追加:

| Variable | Description | 値の例 |
|----------|------------|--------|
| `OWL_API_URL` | owl-encyclopedia API ベースURL | `https://owl-api.up.railway.app` |
| `OWL_WEBHOOK_SECRET` | Webhook HMAC-SHA256署名用シークレット | `whsec_ランダム文字列` |

---

## テスト

**ファイル:** `tests/owl-api.test.js`

- 環境変数未設定時の null 返却
- 正常送信時のレスポンス
- API失敗時の null 返却（エラー吸収確認）
- タイムアウト時の null 返却
- HMAC署名が正しく生成されること（timestamp + "." + body）

---

## 影響範囲

| 項目 | 影響 |
|------|------|
| 既存日記作成機能 | **影響なし** |
| 既存リサーチ機能 | **影響なし**（GitHub保存は維持） |
| 既存SNS投稿機能 | **影響なし** |
| 既存168テスト | **影響なし**（全テスト通過を確認） |
| 新規ファイル | `lib/owl-api.js`, `tests/owl-api.test.js` の2ファイル |
| 変更ファイル | `api/create-research.js` (import + try-catch追加), `docs/diary-input.html` (URLパラメータ15行追加) |

---

## データフロー

```
diary-input.html                           owl-encyclopedia
  リサーチTab                                Spring Boot API
    │                                            │
    │ POST /api/create-research               │
    ▼                                            │
  create-research.js                             │
    │ ① Claude API で構造化                      │
    │ ② GitHub に Markdown 保存                  │
    │ ③ owl-api.js で Webhook 送信 ──────────►│
    │    (HMAC-SHA256署名, fail-open)            │
    ▼                                            ▼
  レスポンス返却                            dinosaur_researches テーブル
  (③の成否に関わらず成功)                    に保存
```

---

## 成功基準

- [ ] 既存168テスト + 新規テスト全通過
- [ ] OWL_API_URL 未設定時にリサーチ作成が正常完了する
- [ ] OWL_API_URL 設定時にリサーチデータが owl-encyclopedia DB に保存される
- [ ] owl-encyclopedia API がダウン時にリサーチ作成が正常完了する
- [ ] diary-input.html に ?type=research&category=dinosaur&topic=xxx でアクセス時にプリフィルされる
- [ ] HMAC-SHA256署名が正しく生成・送信されること

---

## Codex レビュー結果

> 最終レビュー日: 2026-03-27 | ステータス: ✅ ok（3回目で通過）

主要修正: Admin JWT共有 → HMAC-SHA256署名認証に変更、リポジトリ境界の明確化（外部依存条件セクション追加）

---

## 工数見積もり＆進捗管理

> 前提: 全実装を Claude Code に依頼

### diary側 全体（2-3セッション）

| # | タスク | ファイル数 | セッション | 状態 | 完了日 |
|---|--------|----------|-----------|------|-------|
| 2-1 | lib/owl-api.js + HMAC署名生成 | 1 | 0.5 | ⬜ | |
| 2-2 | create-research.jsにWebhookフック追加 | 1 | 0.5 | ⬜ | |
| 2-3 | diary-input.html URLパラメータ対応 | 1 | 0.5 | ⬜ | |
| 2-4 | テスト（owl-api.test.js） | 1 | 0.5 | ⬜ | |
| 2-R | codex-review + 修正 | - | 0.5 | ⬜ | |

### 状態の凡例

| 記号 | 意味 |
|------|------|
| ⬜ | 未着手 |
| 🔵 | 進行中 |
| ✅ | 完了 |
| ⏸️ | 保留 |
| ❌ | 中止 |
