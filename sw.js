const CACHE = "jjok-v1";
const CORE = [
  "/",
  "/board",
  "/manifest.json",
  "/assets/css/style.css",
  "/assets/js/app.js",
  "/assets/js/db.js",
  "/assets/js/config.js",
  "/assets/favicon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 정적 에셋: 캐시 우선 + 백그라운드 갱신
  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.json") {
    e.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => hit);
        return hit || fresh;
      })
    );
    return;
  }

  // 문서(HTML): 네트워크 우선, 실패 시 캐시
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
  }
});
