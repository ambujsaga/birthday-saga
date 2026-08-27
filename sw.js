self.addEventListener('fetch', () => {}); 

self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  // Simple pass-through - network se hi sab kuch load hota hai jaisa pehle hota tha.
  event.respondWith(fetch(event.request));
});
