/* ===== SAMS Service Worker v1.0 ===== */
/* Handles offline caching and background sync */

const CACHE_NAME = 'sams-cache-v1';
const DATA_CACHE_NAME = 'sams-data-v1';

// Assets to cache on install (core app files)
const STATIC_ASSETS = [
  '/web/',
  '/web/index.html',
  '/web/login.html',
  '/web/register.html',
  '/web/home.html',
  '/web/profile.html',
  '/web/settings.html',
  '/web/offline.html',
  '/web/cr-dashboard.html',
  '/web/admin.html',
  '/web/404.html',
  '/web/privacy.html',
  '/web/style.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-solid-900.woff2',
  'https://files.catbox.moe/b0h2so.png'
];

// Core JS files (cached but not critical for offline first load)
const CORE_JS = [
  '/core/config.js',
  '/core/auth.js',
  '/core/location.js',
  '/core/offline.js',
  '/core/pwa.js',
  '/core/utils.js'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll([...STATIC_ASSETS, ...CORE_JS]);
      })
      .then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle different types of requests
  if (request.method === 'GET') {
    // API requests (JSON data)
    if (url.pathname.includes('/data/json/')) {
      event.respondWith(handleDataRequest(request));
    }
    // HTML/CSS/JS assets
    else if (url.pathname.startsWith('/web/') || url.pathname.startsWith('/core/')) {
      event.respondWith(handleStaticRequest(request));
    }
    // External resources (Font Awesome, images)
    else {
      event.respondWith(handleExternalRequest(request));
    }
  }
  
  // POST requests (attendance, sync)
  if (request.method === 'POST') {
    if (url.pathname.includes('/api/attendance')) {
      event.respondWith(handleAttendancePost(request));
    }
  }
});

// ===== HANDLE STATIC REQUESTS =====
async function handleStaticRequest(request) {
  // Try cache first, then network
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If offline and not in cache, show offline page
    if (request.destination === 'document') {
      return caches.match('/web/offline.html');
    }
    return new Response('Offline - Content not available', { status: 503 });
  }
}

// ===== HANDLE DATA REQUESTS (JSON) =====
async function handleDataRequest(request) {
  // Try network first for fresh data
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DATA_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    // If offline, serve cached data
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cached data, return empty JSON with offline notice
    return new Response(
      JSON.stringify({ 
        offline: true, 
        message: 'You are offline. Showing cached data where available.',
        data: []
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
}

// ===== HANDLE EXTERNAL REQUESTS =====
async function handleExternalRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return a simple placeholder for failed external resources
    if (request.url.includes('font-awesome')) {
      return new Response('', { status: 200 }); // Ignore font errors offline
    }
    return new Response('External resource unavailable', { status: 503 });
  }
}

// ===== HANDLE ATTENDANCE POST =====
async function handleAttendancePost(request) {
  try {
    // Try to send immediately if online
    if (navigator.onLine) {
      const response = await fetch(request.clone());
      if (response.ok) {
        return response;
      }
    }
  } catch (error) {
    // If offline, store in IndexedDB for later sync
    const clone = request.clone();
    const data = await clone.json();
    
    // Store in IndexedDB
    await saveOfflineAttendance(data);
    
    // Return success response to user (will sync later)
    return new Response(
      JSON.stringify({ 
        success: true, 
        offline: true, 
        message: 'Attendance saved offline. Will sync when online.' 
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
}

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', event => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncOfflineAttendance());
  }
});

// ===== SYNC OFFLINE ATTENDANCE =====
async function syncOfflineAttendance() {
  try {
    // Get pending attendance from IndexedDB
    const pending = await getOfflineAttendance();
    
    for (const record of pending) {
      try {
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        });
        
        if (response.ok) {
          await removeOfflineAttendance(record.id);
        }
      } catch (error) {
        console.error('Failed to sync record:', record.id);
      }
    }
    
    // Notify all clients that sync is complete
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        synced: pending.length
      });
    });
    
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// ===== INDEXEDDB HELPERS =====
// (Simplified - in real app, use a proper IndexedDB library)

async function saveOfflineAttendance(data) {
  // This is a mock - implement actual IndexedDB
  console.log('Saving offline attendance:', data);
}

async function getOfflineAttendance() {
  // Mock - return empty array
  return [];
}

async function removeOfflineAttendance(id) {
  console.log('Removing synced record:', id);
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: 'https://files.catbox.moe/b0h2so.png',
    badge: 'https://files.catbox.moe/b0h2so.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/web/home.html'
    },
    actions: [
      {
        action: 'open',
        title: 'Open SAMS'
      },
      {
        action: 'close',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data.url;
    
    event.waitUntil(
      clients.openWindow(urlToOpen)
    );
  }
});

// ===== PERIODIC BACKGROUND SYNC (for regular updates) =====
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-cache') {
    event.waitUntil(updateCache());
  }
});

async function updateCache() {
  // Update cached data periodically
  const cache = await caches.open(DATA_CACHE_NAME);
  // Fetch and cache latest announcements, etc.
  console.log('Periodic cache update');
}

// ===== MESSAGE HANDLING =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(DATA_CACHE_NAME);
    caches.delete(CACHE_NAME);
    event.ports[0].postMessage({ success: true });
  }
});

// ===== OFFLINE ANALYTICS =====
self.addEventListener('fetch', event => {
  // Track offline usage (optional)
  if (!navigator.onLine && event.request.url.includes('/api/')) {
    console.log('Offline API access:', event.request.url);
    // Could store for analytics
  }
});

console.log('[Service Worker] Registered successfully');
