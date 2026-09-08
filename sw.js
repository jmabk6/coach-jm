const CACHE_NAME='coach-jm-ui4-20260908';
const APP_SHELL=[
  './','./index.html','./css/app.css?v=4','./js/app.js?v=4','./manifest.json?v=4',
  './assets/icons/icon-192.png?v=4','./assets/icons/icon-512.png?v=4'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response && response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{});}return response;
  }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
