/**
 * Lazy-load the Twitch Embed JS API exactly once.
 * Resolves with the global `Twitch` namespace (provides Twitch.Player).
 */
let twitchPromise = null

export function loadTwitchAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.Twitch && window.Twitch.Player) return Promise.resolve(window.Twitch)
  if (twitchPromise) return twitchPromise

  twitchPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://embed.twitch.tv/embed/v1.js'
    tag.async = true
    tag.dataset.twitchEmbed = '1'
    tag.onload = () => {
      if (window.Twitch && window.Twitch.Player) resolve(window.Twitch)
      else reject(new Error('Twitch.Player did not appear after script load'))
    }
    tag.onerror = () => reject(new Error('Failed to load Twitch embed script'))
    document.head.appendChild(tag)
  })
  return twitchPromise
}
