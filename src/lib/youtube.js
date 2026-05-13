/**
 * Parse a YouTube video ID from common URL formats.
 * Supports:
 *   - https://www.youtube.com/watch?v=VIDEOID
 *   - https://youtube.com/watch?v=VIDEOID&t=...
 *   - https://youtu.be/VIDEOID
 *   - https://www.youtube.com/embed/VIDEOID
 *   - https://www.youtube.com/shorts/VIDEOID
 *   - bare 11-character video id
 */
export function parseYouTubeId(input) {
  if (!input) return null
  const trimmed = String(input).trim()

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1)
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        const v = url.searchParams.get('v')
        return v && /^[a-zA-Z0-9_-]{11}$/.test(v) ? v : null
      }
      const m = url.pathname.match(/^\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
      if (m) return m[2]
    }
  } catch {
    /* not a URL — fall through */
  }
  return null
}

let ytApiPromise = null

/**
 * Lazy-load the YouTube IFrame API exactly once.
 * Resolves with the global YT namespace.
 */
export function loadYouTubeAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise

  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') {
        try { prev() } catch { /* ignore */ }
      }
      resolve(window.YT)
    }
    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.dataset.ytIframeApi = '1'
      document.head.appendChild(tag)
    }
  })
  return ytApiPromise
}
