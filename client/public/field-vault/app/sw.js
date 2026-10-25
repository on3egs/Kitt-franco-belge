const CACHE="kyronext-field-vault-shell-v1";
const BASE=new URL("./",self.registration.scope);
const FILES=["","index.html","app.css","app.js","manifest.webmanifest","icon.svg"].map(x=>new URL(x,BASE).href);
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||u.pathname.startsWith("/api/"))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&e.request.method==="GET"){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match(new URL("index.html",BASE).href))))});
