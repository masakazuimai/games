// Service Worker。ホーム画面から起動したときにオフラインでも遊べるようにする。
//
// 方針は3つ。
//   1. 触るのは同一オリジンのGETだけ。広告(AdSense)・計測(GA4)には一切介入しない
//      （オフラインでそれらが失敗しても、ゲーム本体は動き続ける）
//   2. 照合は ignoreSearch。ESモジュールの import に付けている `?v=` でキャッシュが
//      すり抜けるのを防ぐ（この構成特有の落とし穴）
//   3. skipWaiting は使わない。表示中のページのモジュールと新しいアセットが混ざると
//      不整合を起こすため、更新は「次に起動したとき」に反映させる
//
// ▼ ファイルを更新したときの手順
//   1. これまでどおり index.html と各 import の `?v=` を揃えて上げる
//   2. 下の VERSION も同じ日付版に上げる（キャッシュを作り直して古い版を捨てるため）
//   ※ 2を忘れても stale-while-revalidate が次の起動で追いつくので致命傷にはならない。
//     ただし「1回は古い画面が出る」ので、意図した更新なら必ず2までやること。
//   ※ SHELL_ASSETS への追加漏れは、その1件がオフラインで落ちるだけで他は動く。

const VERSION = "20260809a"
const SHELL_CACHE = `lt-shell-${VERSION}`
const FONT_CACHE = `lt-font-${VERSION}`

/** 起動に必要な最小構成。`?v=` は付けない（照合時に無視するため）。 */
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
      // 1つでも失敗すると全体が失敗する addAll は使わず、取れたものだけ入れる
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

/**
 * 保存キーからクエリを落とす。`?v=` 付きで貯めると同じファイルが版ごとに増え、
 * ignoreSearch 照合でどれが返るか読めなくなるため、1パス1エントリに正規化する。
 */
function cacheKey(request) {
  const url = new URL(request.url)
  url.search = ""
  return url.href
}

/**
 * キャッシュを即返しつつ、裏で取り直して次回に備える（stale-while-revalidate）。
 * ⚠️ ここを単純なキャッシュ優先にしてはいけない。照合が ignoreSearch なので、
 *    `?v=` を上げても更新が届かず、sw.js の VERSION 更新漏れが永続的な事故になる。
 *    この方式なら版上げを忘れても、次の起動で最新に追いつく。
 */
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
      // オフラインなら失敗して当然。キャッシュがあるならそれで足りる
      if (cached) return cached
      throw error
    })

  // 応答を返した直後にSWが停止すると裏の取り直しが中断されるので、寿命を延ばしておく
  if (cached) event.waitUntil(fetching)
  return cached ?? fetching
}

/** ネットワーク優先。オフライン時だけキャッシュに退避する（HTML用）。 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(cacheKey(request), response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true })
    if (cached) return cached
    // index.html 自体が無いと真っ白になるので最後の砦として返す
    const fallback = await cache.match("./index.html")
    if (fallback) return fallback
    throw error
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Webフォントはオフラインでも見た目を保ちたいので別キャッシュに貯める
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE))
    return
  }

  // 同一オリジンかつ自分のスコープ内だけを担当する（広告・計測はここで除外される）
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(new URL("./", self.location.href).pathname)) return

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }
  event.respondWith(staleWhileRevalidate(event, SHELL_CACHE))
})
