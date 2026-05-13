/**
 * Lazy-load the Vimeo Player API (player.js) exactly once.
 * Resolves with the global `Vimeo` namespace (provides Vimeo.Player).
 */
let vimeoPromise = null

export function loadVimeoAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.Vimeo && window.Vimeo.Player) return Promise.resolve(window.Vimeo)
  if (vimeoPromise) return vimeoPromise

  vimeoPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://player.vimeo.com/api/player.js'
    tag.async = true
    tag.dataset.vimeoPlayer = '1'
    tag.onload = () => {
      if (window.Vimeo && window.Vimeo.Player) resolve(window.Vimeo)
      else reject(new Error('Vimeo.Player did not appear after script load'))
    }
    tag.onerror = () => reject(new Error('Failed to load Vimeo player script'))
    document.head.appendChild(tag)
  })
  return vimeoPromise
}
