/**
 * Unified media URL parser.
 *
 * Supported kinds:
 *   - 'youtube'   — full sync (YT IFrame API)
 *   - 'twitch'    — full sync (Twitch Embed API)  — channel | video | clip
 *   - 'vimeo'     — full sync (Vimeo Player API)
 *   - 'direct'    — full sync (HTML5 <video>)     — .mp4/.webm/.mov/.ogg
 *   - 'drive'     — embed only (no sync)          — public Google Drive video
 *
 * Returns null if the URL doesn't match any supported source.
 *
 * Shape of the parsed object:
 *   {
 *     kind:           one of the above
 *     url:            the original input, trimmed
 *     id:             best-effort canonical id (videoId, vimeoId, drive fileId, …)
 *     channel?:       Twitch channel slug (when kind === 'twitch' and live)
 *     twitchType?:    'channel' | 'video' | 'clip'
 *     supportsSync:   boolean — whether host can drive guests' playback
 *   }
 */

const YT_ID = /^[a-zA-Z0-9_-]{11}$/

export function parseMediaUrl(input) {
  if (!input) return null
  const trimmed = String(input).trim()

  // Bare 11-char string → assume YouTube id
  if (YT_ID.test(trimmed)) {
    return mk('youtube', trimmed, `https://www.youtube.com/watch?v=${trimmed}`)
  }

  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  const path = url.pathname

  // ──────────────── YouTube ────────────────
  if (host === 'youtu.be') {
    const id = path.slice(1)
    return YT_ID.test(id) ? mk('youtube', id, trimmed) : null
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (path === '/watch') {
      const v = url.searchParams.get('v')
      return v && YT_ID.test(v) ? mk('youtube', v, trimmed) : null
    }
    const m = path.match(/^\/(?:embed|shorts|v|live)\/([a-zA-Z0-9_-]{11})/)
    if (m) return mk('youtube', m[1], trimmed)
  }

  // ──────────────── Twitch ─────────────────
  if (host === 'twitch.tv' || host === 'm.twitch.tv') {
    // VOD: /videos/123456
    let m = path.match(/^\/videos\/(\d+)/)
    if (m) return mk('twitch', m[1], trimmed, { twitchType: 'video' })

    // Clip: /<channel>/clip/<slug>
    m = path.match(/^\/[^/]+\/clip\/([^/?#]+)/)
    if (m) return mk('twitch', m[1], trimmed, { twitchType: 'clip' })

    // Live: /<channel>
    m = path.match(/^\/([^/?#]+)\/?$/)
    if (m && m[1] && !RESERVED_TWITCH.has(m[1])) {
      return mk('twitch', m[1], trimmed, { twitchType: 'channel', channel: m[1] })
    }
  }
  if (host === 'clips.twitch.tv') {
    const slug = path.slice(1).split('/')[0]
    if (slug) return mk('twitch', slug, trimmed, { twitchType: 'clip' })
  }

  // ──────────────── Vimeo ──────────────────
  if (host === 'vimeo.com') {
    const m = path.match(/^\/(\d+)/)
    if (m) return mk('vimeo', m[1], trimmed)
  }
  if (host === 'player.vimeo.com') {
    const m = path.match(/^\/video\/(\d+)/)
    if (m) return mk('vimeo', m[1], trimmed)
  }

  // ──────────────── Google Drive ───────────
  if (host === 'drive.google.com') {
    // /file/d/<ID>/view
    let m = path.match(/^\/file\/d\/([^/]+)/)
    if (m) return mk('drive', m[1], trimmed, { supportsSync: false })
    // /open?id=<ID>
    if (path === '/open') {
      const id = url.searchParams.get('id')
      if (id) return mk('drive', id, trimmed, { supportsSync: false })
    }
  }

  // ──────────────── Pixeldrain ─────────────
  // Convert viewer pages to direct stream URLs:
  //   https://pixeldrain.com/u/<id>     → /api/file/<id>
  //   https://pixeldrain.com/api/file/<id> → already direct
  if (host === 'pixeldrain.com') {
    let m = path.match(/^\/u\/([A-Za-z0-9]+)/)
    if (m) return mk('direct', m[1], `https://pixeldrain.com/api/file/${m[1]}`)
    m = path.match(/^\/api\/file\/([A-Za-z0-9]+)/)
    if (m) return mk('direct', m[1], trimmed)
  }

  // ──────────────── Catbox / litterbox ─────
  if (host === 'files.catbox.moe' || host === 'litter.catbox.moe') {
    return mk('direct', trimmed, trimmed)
  }

  // ──────────────── Direct video ───────────
  // Recognized by file extension (or pathname looking like a media file).
  if (/\.(mp4|webm|mov|m4v|ogg|ogv)(\?|#|$)/i.test(path)) {
    return mk('direct', trimmed, trimmed)
  }

  return null
}

const RESERVED_TWITCH = new Set([
  'directory', 'p', 'subscriptions', 'inventory', 'wallet',
  'settings', 'friends', 'login', 'signup', 'about',
  'jobs', 'turbo', 'prime', 'creatorcamp', 'security',
])

function mk(kind, id, url, extra = {}) {
  return {
    kind,
    id,
    url,
    supportsSync: true,
    ...extra,
  }
}

/**
 * Pretty short label for a parsed media object — used in placeholder UI.
 */
export function mediaLabel(media) {
  if (!media) return ''
  switch (media.kind) {
    case 'youtube': return 'YouTube'
    case 'twitch':
      return media.twitchType === 'channel'
        ? `Twitch · ${media.channel}`
        : 'Twitch'
    case 'vimeo':   return 'Vimeo'
    case 'direct':  return 'Video file'
    case 'drive':   return 'Google Drive'
    default:        return media.kind
  }
}
