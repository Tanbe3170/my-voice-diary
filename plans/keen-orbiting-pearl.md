# service-worker.js作成プラン

## Context
IMPLEMENTATION_PLAN.md Phase 2 タスク2.5に従って、PWAのオフライン対応とキャッシュ管理を行うservice-worker.jsを作成します。これにより、voice-diaryアプリがオフライン環境でも動作し、リソースをキャッシュして高速に表示できるようになります。

manifest.jsonは既に作成済みで、PWAの基本設定は完了しています。service-worker.jsを追加することで、PWAの機能が完全になります。

## 要件
- **オフライン対応**: ネットワーク接続がない状態でもアプリを起動できる
- **キャッシュ管理**: HTML、CSS、JavaScriptファイルをキャッシュして高速表示
- **日本語コメント**: すべてのコメントを日本語で記述
- **キャッシュ戦略**: Cache First（キャッシュ優先、失敗時にネットワーク）

## 実装計画

### ステップ1: service-worker.js作成（新規ファイル）
IMPLEMENTATION_PLAN.md タスク2.5の例をベースに、日本語コメント付きで`docs/service-worker.js`を作成：

**機能:**
1. **installイベント**: アプリのリソースをキャッシュに保存
2. **fetchイベント**: リクエストをキャッシュから返す（Cache First戦略）
3. **activateイベント**: 古いキャッシュを削除（オプション）

**キャッシュ対象:**
- `/my-voice-diary/` （ルートパス）
- `/my-voice-diary/index.html`
- `/my-voice-diary/diary-input.html`
- `/my-voice-diary/style.css`
- `/my-voice-diary/app.js`
- `/my-voice-diary/manifest.json`

**実装内容:**
```javascript
// service-worker.js
// My Voice Diary - Service Worker (オフライン対応 + キャッシュ管理)

// キャッシュ名（バージョン管理用）
const CACHE_NAME = 'voice-diary-v1';

// キャッシュするURLリスト
const urlsToCache = [
  '/my-voice-diary/',
  '/my-voice-diary/index.html',
  '/my-voice-diary/diary-input.html',
  '/my-voice-diary/style.css',
  '/my-voice-diary/app.js',
  '/my-voice-diary/manifest.json'
];

// Service Workerのインストール時に実行
// アプリのリソースをキャッシュに保存
self.addEventListener('install', (event) => {
  console.log('[Service Worker] インストール中...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] キャッシュを開きました');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[Service Worker] すべてのリソースをキャッシュしました');
      })
  );
});

// リソースのリクエスト時に実行
// キャッシュ優先で、キャッシュになければネットワークから取得
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュにあればキャッシュから返す
        if (response) {
          console.log('[Service Worker] キャッシュから返却:', event.request.url);
          return response;
        }

        // キャッシュになければネットワークから取得
        console.log('[Service Worker] ネットワークから取得:', event.request.url);
        return fetch(event.request);
      })
  );
});

// Service Workerの有効化時に実行
// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] 有効化中...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 現在のキャッシュ名と異なる古いキャッシュを削除
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

### ステップ2: Service Worker登録コードの追加
`docs/app.js`の最後に、Service Workerを登録するコードを追加：

**追加位置**: app.js の最終行（DOMContentLoadedイベントリスナーの後）

**実装内容:**
```javascript
// === Service Worker登録 ===
// PWA対応：オフライン機能とキャッシュ管理
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/my-voice-diary/service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker登録成功:', registration.scope);
      })
      .catch((error) => {
        console.error('❌ Service Worker登録失敗:', error);
      });
  });
}
```

## 重要なファイル
- `docs/service-worker.js` - 新規作成（オフライン対応 + キャッシュ管理）
- `docs/app.js` - Service Worker登録コードを最終行に追加
- `docs/manifest.json` - 既に作成済み（変更不要）

## 検証方法

### 1. ローカル確認
```bash
# HTTPSでないとService Workerは動作しないため、GitHubにpush後に確認
```

### 2. GitHub Pages での確認
1. ファイルをGitHubにpushしてデプロイ完了を待つ
2. Chrome DevTools を開く（F12）
3. **Application** タブ → **Service Workers**
4. `https://tanbe3170.github.io/my-voice-diary/` が登録されているか確認
5. **Cache** → **Cache Storage** でキャッシュされたリソースを確認

### 3. オフライン動作確認
1. Chrome DevTools → **Network** タブ
2. **Offline** チェックボックスをON
3. ページをリロード
4. オフライン状態でもページが表示されることを確認

### 4. スマートフォンでの確認
1. スマートフォンのChromeで https://tanbe3170.github.io/my-voice-diary/ にアクセス
2. ページをホーム画面に追加
3. 機内モードをON
4. ホーム画面からアプリを起動
5. オフラインでも起動することを確認

## 注意事項
- Service WorkerはHTTPS環境でのみ動作（GitHub Pagesは自動的にHTTPS）
- ローカルでテストする場合は`localhost`でのみ動作
- キャッシュを更新する際は`CACHE_NAME`のバージョン番号を変更（例: 'voice-diary-v2'）
- console.logは開発時のデバッグ用、本番環境では削除可能

## 期待される効果
- 初回訪問後、2回目以降は高速に表示
- オフライン環境でもアプリが起動
- ネットワーク負荷の軽減
- PWAとして完全に機能（manifest.json + service-worker.js）
