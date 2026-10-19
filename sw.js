'use strict';
const CACHE='vincent-shell-v3';
const FILES=['./','./index.html','./app.js','./history-state.js','./activity-summary.js','./app.css','./pwa.css','./manifest.webmanifest','./assets/vincent-character.webp','./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png'];
const SCOPE=new URL('./',self.location).pathname;
const STATIC=new Set(FILES.map(path=>new URL(path,self.location).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('vincent-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Never cache API responses, connection discovery, tokens, uploads or history.
 if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('Authorization')||!STATIC.has(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(async()=>{
  const cache=await caches.open(CACHE);return await cache.match(request)||(request.mode==='navigate'?await cache.match(SCOPE+'index.html'):null)||Response.error();
 }));
});
