
const VERSION = "20261027c"
const SHELL_CACHE = `lt-shell-${VERSION}`
const FONT_CACHE = `lt-font-${VERSION}`

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/main.js",
  "./js/puzzles.js",
  "./js/engine.js",
  "./js/ai.js",
  "./js/daily.js",
  "./js/data-general.js",
  "./js/data-engineer.js",
  "./js/data-designer.js",
  "./js/data-video.js",
  "./assets/icon-192.png",
  "./assets/apple-touch-icon.png",
]

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map((asset) =>
            cache.add(asset).catch((error) => {
              console.warn("プリキャッシュに失敗しました:", asset, error)
            })
          )
        )
      )
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("lt-") && key !== SHELL_CACHE && key !== FONT_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

function cacheKey(request) {
  const url = new URL(request.url)
  url.search = ""
  return url.href
}

async function staleWhileRevalidate(event, cacheName) {
  const { request } = event
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request, { ignoreSearch: true })

  const fetching = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") {
        cache.put(cacheKey(request), response.clone())
      }
      return response
    })
    .catch((error) => {
      if (cached) return cached
      throw error
    })

  if (cached) event.waitUntil(fetching)
  return cached ?? fetching
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(cacheKey(request), response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true })
    if (cached) return cached
    const fallback = await cache.match("./index.html")
    if (fallback) return fallback
    throw error
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE))
    return
  }

  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(new URL("./", self.location.href).pathname)) return

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }
  event.respondWith(staleWhileRevalidate(event, SHELL_CACHE))
})
