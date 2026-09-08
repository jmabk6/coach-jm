const CACHE_NAME='coach-jm-ui3-20260908';
const APP_SHELL=[
  './','./index.html','./css/app.css?v=3','./js/app.js?v=3','./manifest.json?v=3',
  './assets/icons/icon-192.png?v=3','./assets/icons/icon-512.png?v=3'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response && response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{});}return response;
  }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
