// Πειραματικό · αρχεία εκτός σύνδεσης · WebApp.
import { APP_VERSION } from './core/catalog.mjs';

const root = new URL('./', self.location.href);
const prefix = 'object-measurement:' + root.pathname + ':';
const cacheName = prefix + APP_VERSION;
const files = [
  'index.html', 'theme.css', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'main.mjs', 'sw.mjs', 'contour-worker.mjs', 'ui/acquisition.mjs', 'ui/contour-reader.mjs', 'ui/fields.mjs',
  'ui/model.mjs', 'ui/templates.mjs', 'ui/viewport.mjs',
  'core/calibration.mjs', 'core/catalog.mjs', 'core/contour_core.mjs', 'core/geometry.mjs', 'core/identity.mjs',
  'core/image.mjs', 'core/measurement.mjs', 'core/raster-format.mjs', 'core/seed-contour.mjs', 'core/sha256.mjs',
  'contract/check_measurement.mjs', 'methods/taubin.mjs', 'methods/triplet-median.mjs',
];
const assets = new Map(files.map(file => {
  const url = new URL(file, root);
  return [url.pathname, url.href];
}));
const index = assets.get(new URL('index.html', root).pathname);
const localRequest = (url, cache) => new Request(url, { mode: 'same-origin', redirect: 'error', cache });

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...assets.values()].map(url => localRequest(url, 'reload')));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== root.origin) return;
  const stored = url.pathname === root.pathname ? index : assets.get(url.pathname);
  if (!stored) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(stored) ?? await fetch(localRequest(stored, 'no-cache'));
  })());
});
