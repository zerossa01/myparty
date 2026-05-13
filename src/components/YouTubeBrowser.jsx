import { useEffect, useRef, useState } from 'react'
import { searchVideos, getTrending, hasYouTubeApiKey } from '../lib/youtubeApi.js'

/**
 * YouTubeBrowser — search + trending grid.
 * When the user clicks a result, `onPick(url)` is called with a YouTube
 * watch URL ready to be loaded by VideoPlayer.
 */
export default function YouTubeBrowser({ onPick, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('trending') // 'trending' | 'search'
  const abortRef = useRef(null)

  const keyPresent = hasYouTubeApiKey()

  // Initial trending load
  useEffect(() => {
    if (!keyPresent) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getTrending()
      .then((items) => { if (!cancelled) setResults(items) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [keyPresent])

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) {
      // empty → back to trending
      setMode('trending')
      setLoading(true)
      try {
        setResults(await getTrending())
        setError(null)
      } catch (err) { setError(err.message) }
      finally { setLoading(false) }
      return
    }
    setMode('search')
    setLoading(true)
    setError(null)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const items = await searchVideos(query, { signal: ctrl.signal })
      setResults(items)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!keyPresent) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
        <div className="mb-1 font-semibold text-zinc-200">YouTube search not configured</div>
        Add a <code className="rounded bg-zinc-800 px-1 text-xs">VITE_YOUTUBE_API_KEY</code> in
        your environment (locally in <code className="rounded bg-zinc-800 px-1 text-xs">.env</code>,
        and in Vercel project settings) to enable in-app search.
        Meanwhile you can paste any YouTube URL in the box below.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube…"
          className="min-h-[40px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-fuchsia-400"
        />
        <button
          type="submit"
          disabled={disabled || loading}
          className="min-h-[40px] rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '…' : 'Search'}
        </button>
      </form>

      <div className="mt-2 text-xs text-zinc-500">
        {mode === 'search' ? `Results for "${query}"` : 'Trending on YouTube'}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="mt-3 grid max-h-[360px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((r) => (
          <button
            key={r.videoId}
            type="button"
            disabled={disabled}
            onClick={() => onPick?.(`https://www.youtube.com/watch?v=${r.videoId}`)}
            className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-left transition hover:border-fuchsia-500 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="aspect-video w-full overflow-hidden bg-zinc-900">
              {r.thumbnail ? (
                <img
                  src={r.thumbnail}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                />
              ) : null}
            </div>
            <div className="p-2">
              <div className="line-clamp-2 text-xs font-semibold text-zinc-100">{r.title}</div>
              <div className="mt-0.5 truncate text-[11px] text-zinc-400">{r.channel}</div>
            </div>
          </button>
        ))}
        {!loading && results.length === 0 && (
          <div className="col-span-full py-6 text-center text-sm text-zinc-500">
            No results.
          </div>
        )}
      </div>
    </div>
  )
}
