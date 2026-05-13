/**
 * Tiny wrapper around the YouTube Data API v3.
 * Uses a public (referrer-restricted) API key shipped via VITE_YOUTUBE_API_KEY.
 *
 * Two calls exposed:
 *   - searchVideos(query)  — search endpoint (costs 100 quota units / call)
 *   - getTrending()        — most-popular chart (costs 1 quota unit / call)
 *
 * Both return a normalized shape:
 *   [{ videoId, title, channel, thumbnail, publishedAt }]
 */

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || ''
const BASE = 'https://www.googleapis.com/youtube/v3'

export function hasYouTubeApiKey() {
  return Boolean(API_KEY)
}

export async function searchVideos(query, { maxResults = 12, signal } = {}) {
  if (!API_KEY) throw new Error('missing-api-key')
  if (!query?.trim()) return []

  const url = new URL(`${BASE}/search`)
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('q', query.trim())
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('safeSearch', 'none')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`YouTube search failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.items || []).map((it) => ({
    videoId:     it.id?.videoId,
    title:       it.snippet?.title || '',
    channel:     it.snippet?.channelTitle || '',
    thumbnail:   pickThumbnail(it.snippet?.thumbnails),
    publishedAt: it.snippet?.publishedAt || '',
  })).filter((v) => v.videoId)
}

export async function getTrending({ regionCode = 'US', maxResults = 12, signal } = {}) {
  if (!API_KEY) throw new Error('missing-api-key')

  const url = new URL(`${BASE}/videos`)
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('chart', 'mostPopular')
  url.searchParams.set('regionCode', regionCode)
  url.searchParams.set('maxResults', String(maxResults))

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`YouTube trending failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.items || []).map((it) => ({
    videoId:     it.id,
    title:       it.snippet?.title || '',
    channel:     it.snippet?.channelTitle || '',
    thumbnail:   pickThumbnail(it.snippet?.thumbnails),
    publishedAt: it.snippet?.publishedAt || '',
  })).filter((v) => v.videoId)
}

function pickThumbnail(t) {
  if (!t) return ''
  return t.medium?.url || t.high?.url || t.default?.url || ''
}
