const CACHE_NAME = "chaoyou-pingpong-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

// 安裝 Service Worker 並預快取資源
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching all static shell assets...");
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活 Service Worker 並清理舊快取
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截請求並採用快取優先 (Cache-First) 策略
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // 若快取中沒有，則進行網路請求並動態快取新資源
      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // 只快取 HTTP/HTTPS 請求 (排除 file:// 或 Chrome 內部擴充請求)
          if (e.request.url.startsWith("http")) {
            cache.put(e.request, responseToCache);
          }
        });

        return networkResponse;
      }).catch(() => {
        // 離線且無快取時的備用處理 (可擴充)
      });
    })
  );
});
