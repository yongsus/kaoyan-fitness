const CACHE_NAME = 'fitness-tracker-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './utils.js',
  './timer.js',
  './schedule.js',
  './diet.js',
  './workout.js',
  './stats.js',
  './reports.js',
  './backup.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(() => {
      // 忽略 CDN 资源缓存失败
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 只缓存同源请求和 CDN 脚本
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCdnScript = url.hostname === 'cdn.tailwindcss.com' ||
                      url.hostname === 'cdn.jsdelivr.net';

  if (!isSameOrigin && !isCdnScript) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 后台更新缓存
        fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // 离线且未缓存时返回空响应
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
