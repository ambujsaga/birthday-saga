// CSE 1st Sem Portal — Service Worker (compressed, offline-enabled)
// Merges old sw.js (skipWaiting/clients.claim for install-prompt + notifications)
// with real offline caching (app-shell + Firebase SDK), all logic same as before.

var V = 'mmitsce-v2', STATIC = V + '-static', RUNTIME = V + '-runtime';
var PRECACHE = [
  './', './index.html', './manifest.json', './logo.jpg?v=1.1',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(STATIC).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return fetch(u, { cache: 'no-cache' }).then(function (r) {
          if (r && (r.ok || r.type === 'opaque')) return c.put(u, r);
        }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('mmitsce-') === 0 && k !== STATIC && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var c2 = r.clone();
        caches.open(STATIC).then(function (c) { c.put('./index.html', c2); });
        return r;
      }).catch(function () {
        return caches.match('./index.html').then(function (m) { return m || caches.match('./'); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) {
          var c2 = r.clone();
          caches.open(RUNTIME).then(function (c) { c.put(req, c2); });
        }
        return r;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
