/**
 * Per-user watch history — stored in localStorage, no backend needed.
 *
 * Entry shape: { url, kind, id, label, addedAt }
 *
 * - URLs are deduped (re-adding moves the entry to the top, fresh timestamp).
 * - Capped at MAX_ENTRIES (oldest entries dropped first).
 * - Storage is best-effort: quota/serialization errors are swallowed and
 *   the in-memory copy is returned so the UI still works.
 */

const KEY = 'rc_history_v1'
const MAX_ENTRIES = 50

function safeRead() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeWrite(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch (err) {
    console.warn('[history] write failed', err)
  }
}

/** Return entries in most-recent-first order. */
export function listHistory() {
  return safeRead()
}

/**
 * Add (or refresh) a history entry. Dedupes by URL. Preserves any cached
 * title/thumb from a previous add for the same URL.
 */
export function addHistory(media, label) {
  if (!media || !media.url) return
  const prev = safeRead()
  const existing = prev.find((e) => e.url === media.url)
  const filtered = prev.filter((e) => e.url !== media.url)
  const next = [
    {
      url: media.url,
      kind: media.kind,
      id: media.id,
      label: label || '',
      title: existing?.title || '',
      thumb: existing?.thumb || defaultThumb(media),
      addedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, MAX_ENTRIES)
  safeWrite(next)
  return next
}

/** Update fields on a single entry (e.g. after async title fetch). */
export function patchHistory(url, patch) {
  const entries = safeRead()
  let changed = false
  const next = entries.map((e) => {
    if (e.url !== url) return e
    changed = true
    return { ...e, ...patch }
  })
  if (changed) safeWrite(next)
  return next
}

/** Best-guess thumbnail URL we can produce synchronously, no fetch needed. */
function defaultThumb(media) {
  if (!media) return ''
  if (media.kind === 'youtube' && media.id) {
    // mqdefault always exists; hqdefault and maxresdefault may 404.
    return `https://img.youtube.com/vi/${media.id}/mqdefault.jpg`
  }
  return ''
}

/**
 * Asynchronously enrich entries that don't yet have a title (or thumb).
 * Uses YouTube + Vimeo oEmbed (both CORS-friendly). Calls `onUpdate(entries)`
 * after each successful fetch so the UI can re-render.
 */
export async function enrichHistory(onUpdate) {
  const entries = safeRead()
  for (const entry of entries) {
    if (entry.title) continue
    try {
      let title = ''
      let thumb = entry.thumb || ''
      if (entry.kind === 'youtube') {
        const r = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(entry.url)}&format=json`
        )
        if (r.ok) {
          const j = await r.json()
          title = j.title || ''
          thumb = j.thumbnail_url || thumb
        }
      } else if (entry.kind === 'vimeo') {
        const r = await fetch(
          `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(entry.url)}`
        )
        if (r.ok) {
          const j = await r.json()
          title = j.title || ''
          thumb = j.thumbnail_url || thumb
        }
      }
      if (title || thumb) {
        const next = patchHistory(entry.url, { title, thumb })
        if (typeof onUpdate === 'function') onUpdate(next)
      }
    } catch { /* ignore individual failures */ }
  }
}

/** Remove a single entry by URL. */
export function removeHistory(url) {
  const next = safeRead().filter((e) => e.url !== url)
  safeWrite(next)
  return next
}

/** Wipe everything. */
export function clearHistory() {
  safeWrite([])
  return []
}

/**
 * Compact, human-friendly short label for an entry.
 * Falls back to the trimmed URL if nothing better is available.
 */
export function entryDisplay(entry) {
  if (!entry) return ''
  if (entry.title) return entry.title
  // Try to pull a filename out of direct-video URLs.
  if (entry.kind === 'direct') {
    try {
      const u = new URL(entry.url)
      const name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
      if (name) return name
    } catch { /* */ }
  }
  if (entry.label) return entry.label
  return entry.url
}

/** Rough "n minutes ago" formatter. */
export function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 45)            return 'just now'
  if (s < 90)            return '1m ago'
  if (s < 60 * 45)       return `${Math.round(s / 60)}m ago`
  if (s < 60 * 90)       return '1h ago'
  if (s < 60 * 60 * 24)  return `${Math.round(s / 3600)}h ago`
  const d = Math.round(s / 86400)
  if (d < 7)             return `${d}d ago`
  if (d < 30)            return `${Math.round(d / 7)}w ago`
  return `${Math.round(d / 30)}mo ago`
}
