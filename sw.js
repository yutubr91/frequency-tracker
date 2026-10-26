const CACHE = "frequency-tracker-v9";
const CRITICAL_ASSETS = ["/index.html", "/app.js"];
const STATIC_ASSETS = ["/styles.css", "/manifest.webmanifest"];
const API_PATH_PREFIX = "/api";
const ALLOWED_ORIGIN = self.location.origin;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([...CRITICAL_ASSETS, ...STATIC_ASSETS].map(p => new Request(p, { cache: "reload" }))))
  );
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function looksTampered(text) {
  if (typeof text !== "string" || text.length === 0) return true;
  if (text.includes("index.html") && !text.includes("<title>FREQUENCY · Tracker BEP-20</title>")) return true;
  if (text.includes("app.js") && !text.includes('const PROXY_BASE = "/api/proxy";')) return true;
  const suspicious = [ /document\.location\s*=\s*["']https?:/i, /eval\s*\(\s*atob\s*\(/i ];
  return suspicious.some(re => re.test(text));
}
async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store", credentials: "omit" });
    if (!response.ok || response.type !== "basic") return response;
    const clone = response.clone(); const text = await clone.text();
    if (!looksTampered(text)) caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {});
    return response;
  } catch {
    const cached = await caches.match(request); if (cached) return cached; throw new Error("offline");
  }
}
async function cacheFirst(request) {
  const cached = await caches.match(request); if (cached) return cached;
  const response = await fetch(request, { credentials: "omit" });
  if (response.ok && response.type === "basic") { const copy = response.clone(); caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {}); }
  return response;
}
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== ALLOWED_ORIGIN) return;
  if (url.pathname.startsWith(API_PATH_PREFIX)) return;
  if (url.pathname.endsWith("/sw.js")) return;
  if (url.search) return;
  const isCritical = CRITICAL_ASSETS.some(a => url.pathname.endsWith(a));
  event.respondWith(isCritical ? networkFirst(event.request) : cacheFirst(event.request));
});