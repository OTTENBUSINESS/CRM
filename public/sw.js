const CACHE_NAME = 'event-app-v2';

// Install - skip waiting immediately to activate new SW
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate - cleanup old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch - network first for everything, cache as offline fallback only
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API/supabase calls — let them go direct
  if (request.url.includes('supabase.co') || request.url.includes('/functions/')) return;

  // Network-first strategy for ALL requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses as offline fallback
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation, fall back to cached root
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
