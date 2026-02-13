# Plan: タスク2.6 - PWA設定ファイル作成（manifest.json + service-worker.js）

## Context（背景）

Phase 2の成果物として `docs/manifest.json` と `docs/service-worker.js` を作成する。IMPLEMENTATION_PLAN.mdのタスク2.5に完全なコードが記載されている（800-851行目）。

index.htmlが `<link rel="manifest" href="manifest.json">` で manifest.json を参照済み。

**現在のdocs/ディレクトリ:**
- index.html ✅, diary-input.html ✅, style.css ✅, app.js ✅
- manifest.json ❌ 未作成, service-worker.js ❌ 未作成

## 実装プラン

### Step 1: docs/manifest.json 作成
IMPLEMENTATION_PLAN.md 802-824行目のコードをそのまま使用。

### Step 2: docs/service-worker.js 作成
IMPLEMENTATION_PLAN.md 828-851行目のコードをそのまま使用。

### Step 3: 確認
- ファイルの存在・サイズ確認
- JSONの構文確認（manifest.json）

## Verification
```bash
ls -lh docs/manifest.json docs/service-worker.js
```
