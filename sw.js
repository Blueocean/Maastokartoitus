/* Maastokartoitus service worker (V1.20)
   - tiles: cache-first, saved as they are viewed (Cache API), size-capped
   - app shell: index.html network-first (4 s timeout) with cached fallback, MapLibre cached */
const SHELL='mk-shell-v1',TILES='mk-tiles-v1';
const SCOPE=self.registration.scope;
const LIBS=['https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js','https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.css'];
let MAX=5000,refreshUntil=0,puts=0;
const isTile=u=>u.hostname==='tiles.kartat.kapsi.fi'||u.hostname==='tile.openstreetmap.org'||(u.hostname==='avoin-karttakuva.maanmittauslaitos.fi'&&u.pathname.startsWith('/avoin/wmts'));

self.addEventListener('install',e=>{
 e.waitUntil(caches.open(SHELL).then(c=>Promise.all([SCOPE,...LIBS].map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==SHELL&&k!==TILES).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{
 const d=e.data||{};
 if('refresh' in d)refreshUntil=d.refresh?Date.now()+90000:0;
 if(d.max)MAX=d.max;
});
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const u=new URL(req.url);
 if(isTile(u)){e.respondWith(tile(e));return}
 if(req.mode==='navigate'&&u.origin===location.origin){e.respondWith(nav(e));return}
 if(u.hostname==='cdnjs.cloudflare.com'){e.respondWith(lib(req))}
});
async function store(c,req,res){
 const blob=await res.blob(),h=new Headers(res.headers);
 h.delete('content-length');h.set('x-sw-at',String(Date.now()));h.set('x-sw-size',String(blob.size));
 await c.put(req,new Response(blob,{status:200,statusText:'OK',headers:h}));
 if(++puts%25===0){const ks=await c.keys();if(ks.length>MAX)await Promise.all(ks.slice(0,ks.length-MAX).map(k=>c.delete(k)))}
}
async function tile(e){
 const req=e.request,c=await caches.open(TILES);
 if(Date.now()>=refreshUntil){const hit=await c.match(req,{ignoreVary:true});if(hit)return hit}
 try{
  const res=await fetch(req);
  if(res.ok&&(res.headers.get('content-type')||'').startsWith('image/'))e.waitUntil(store(c,req,res.clone()).catch(()=>{}));
  return res;
 }catch(err){
  const hit=await c.match(req,{ignoreVary:true});
  return hit||Response.error();
 }
}
async function nav(e){
 const c=await caches.open(SHELL);
 try{
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),4000);
  const res=await fetch(e.request.url,{signal:ctl.signal,cache:'no-cache'});
  clearTimeout(t);
  if(res.ok)e.waitUntil(c.put(SCOPE,res.clone()));
  return res;
 }catch(err){
  return (await c.match(SCOPE,{ignoreSearch:true}))||Response.error();
 }
}
async function lib(req){
 const c=await caches.open(SHELL),hit=await c.match(req);
 if(hit)return hit;
 const r=await fetch(req);
 if(r.ok||r.type==='opaque')c.put(req,r.clone());
 return r;
}
