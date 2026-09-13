/* =====================================================================
   CSE 1st Sem Portal — Service Worker (OFFLINE SUPPORT)
   -----------------------------------------------------------------
   Yeh file purane "minimal" sw.js (jo sirf install-prompt allow karne
   ke liye register hota tha) ki jagah kaam karti hai. index.html me
   pehle se maujood registration line:

        navigator.serviceWorker.register('sw.js')

   ko BILKUL nahi chheda gaya — sirf is 'sw.js' file ke andar ka
   content ab asli offline caching karta hai. Koi purana feature ya
   method (saved posts, timetable, Firebase data, notifications, etc.)
   is file se touch nahi hota — yeh sirf app-shell (HTML/CSS/JS/logo/
   manifest) ko cache karti hai taaki:

     - Timetable (static JS data) offline khule
     - Saved posts (localStorage se IDs + already-loaded content)
       offline dikhe
     - Poori app dubara internet ke bina bhi open ho jaaye
       (jab tak ek baar pehle online load ho chuki ho)

   Firebase realtime data (naye posts/chat/notice) obviously live
   internet maangta hai — offline hote hi sirf wahi part update nahi
   hoga, baaki poori app (UI + saved/local data) bina internet ke
   khulti rahegi.
===================================================================== */

var CACHE_VERSION = 'mmitsce-v2';
var STATIC_CACHE   = CACHE_VERSION + '-static';
var RUNTIME_CACHE  = CACHE_VERSION + '-runtime';

/* App-shell files jo install ke time hi cache ho jaayenge.
   Agar in me se koi ek fail bhi ho jaaye (e.g. offline install ya
   file missing), baaki sab phir bhi cache ho jaayen — isliye addAll()
   ki jagah ek-ek karke, error-tolerant tareeke se cache kiya gaya hai. */
var PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpg?v=1.1',
  // Firebase SDK modules (ESM) — inhe bhi cache karna zaroori hai,
  // warna offline hote hi <script type="module"> import fail ho jaata
  // hai aur poori app crash/blank ho sakti hai.
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return fetch(url, { cache: 'no-cache' })
            .then(function (res) {
              if (res && (res.ok || res.type === 'opaque')) {
                return cache.put(url, res);
              }
            })
            .catch(function () { /* is url ke bina bhi install continue rahe */ });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          // Sirf purane version ke caches hataye jaate hain — kisi
          // aur cache (agar app kahin aur bhi use karti ho) ko chheda
          // nahi jaata.
          if (key.indexOf('mmitsce-') === 0 && key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Sirf GET requests handle karo — POST/PUT/DELETE (Firebase writes
  // etc.) ko seedha network par jaane do, unme chhed-chhaad nahi.
  if (req.method !== 'GET') return;

  // ---- 1) Page navigation (index.html khulna) -> Network-first,
  //         offline hone par cached shell dikhao. Isse hamesha latest
  //         version milta hai jab internet ho, aur offline me bhi
  //         app khulti hai. ----
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var resClone = res.clone();
        caches.open(STATIC_CACHE).then(function (cache) { cache.put('./index.html', resClone); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          return cached || caches.match('./');
        });
      })
    );
    return;
  }

  // ---- 2) Baaki sab static/runtime requests (CSS/JS/images/Firebase
  //         SDK/icons) -> Cache-first, background me update
  //         (stale-while-revalidate) taaki agli baar hamesha fresh
  //         mile lekin abhi turant offline-safe response bhi mile. ----
  event.respondWith(
    caches.match(req).then(function (cached) {
      var networkFetch = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var resClone = res.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(req, resClone); });
        }
        return res;
      }).catch(function () {
        // Network fail (offline) -> agar cache me kuch hai to woh hi
        // upar wapas ho chuka hoga (cached), warna undefined rahega.
        return cached;
      });

      return cached || networkFetch;
    })
  );
});

// Manual update trigger (optional, additive): agar bhavishya me
// index.html se koi naya SW version ke liye 'skipWaiting' message
// bheje, to yeh turant activate ho jaayega. Kuch bhi bheja na jaaye
// to bhi sab kuch pehle jaisa hi normal chalta rahega.
self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
