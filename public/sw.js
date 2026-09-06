// Service worker for the installed driver app.
//
// Its job is to make the app open at all in a bad signal area — a recovery
// driver is, by definition, often somewhere with no bars. It caches the shell
// so the console loads, and deliberately never caches an API response: a
// stale job list or a phantom "on duty" would be worse than an honest error.
// Job data is live or it is nothing.

const SHELL = 'mayte-shell-v1';

// The bare minimum to render the console. Hashed asset files are added as
// they are fetched, since their names change with every build.
const SHELL_URLS = ['/', '/driver', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      // A missing entry must not stop the worker installing.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API. A driver acting on a cached job list would be driving
  // to something that is already someone else's, or already done.
  if (url.pathname.startsWith('/api/')) return;

  // Cross-origin (map tiles, fonts, routing) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a new build is picked up, cache as the
  // fallback that makes the app open at all with no signal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/driver'))),
    );
    return;
  }

  // Hashed build assets never change under the same name, so cache first.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
