const CACHE_NAME = "chaoyou-pingpong-v11";
const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./manifest.json?v=2",
    "./favicon.ico?v=2",
    "./apple-touch-icon.png?v=2",
    "./icon-192.png?v=2",
    "./icon-512.png?v=2",
    "./js/utils.js",
    "./js/crypto_readonly.js",
    "./js/state.js",
    "./js/elo.js",
    "./js/batch.js",
    "./js/charts.js",
    "./js/report.js",
    "./js/app.js"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            ))
            .then(() => self.clients.claim())
    );
});

// Network-First 策略：優先抓取最新版，離線時自動退回快取
self.addEventListener("fetch", (e) => {
    if (e.request.url.includes("/api/") || e.request.method !== "GET") {
        return;
    }

    const reqUrl = new URL(e.request.url);
    if (reqUrl.pathname.endsWith("/data.enc.json") || reqUrl.pathname === "/data.enc.json") {
        e.respondWith(
            fetch(e.request, { cache: "no-store" })
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put("./data.enc.json", responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => caches.match("./data.enc.json"))
        );
        return;
    }

    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        if (e.request.url.startsWith("http")) {
                            cache.put(e.request, responseToCache);
                        }
                    });
                }
                return networkResponse;
            })
            .catch(() => caches.match(e.request))
    );
});
