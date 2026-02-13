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
