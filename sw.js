/* 600个绝美的诗词成语在线学习小工具 — Service Worker：离线缓存，让网页版在手机上像原生 App 一样可用 */
const CACHE = "mtbj-v14";  // v12: 音频改由浏览器原生处理（修复 SW 拦截 .mp3 导致 ERR_ABORTED / 朗诵无语音）
const CORE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "assets/cover.jpg",
  "assets/vol1.jpg",
  "assets/vol2.jpg",
  "assets/vol3.jpg",
  "assets/vol4.jpg",
  "assets/vol5.jpg",
  "assets/vol6.jpg",
  "assets/vol7.jpg",
  "assets/vol8.jpg"
];

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // 音频：不再经 SW 拦截。SW 拦截媒体请求时无法正确处理 HTTP Range 头，
  // Chromium 会因此中止请求 (ERR_ABORTED)，表现为“朗诵无语音”。
  // 直接放行交由浏览器原生 + GitHub CDN 处理即可正常流式播放。
  if (url.pathname.endsWith(".mp3")) return;


  // JS/CSS/HTML：网络优先（确保用户永远拿到最新代码）；网络失败才回退缓存
  var isCode = url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.endsWith("/");
  if (isCode) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("index.html");
        });
      })
    );
    return;
  }

  // 图片等其余资源：缓存优先；未命中则走网络并回填；网络失败回退首页
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match("index.html"); });
    })
  );
});
