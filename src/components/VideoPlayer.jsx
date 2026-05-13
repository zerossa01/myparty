import { useEffect, useRef, useState } from 'react'
import { useYouTube } from '../hooks/useYouTube.js'
import { useSyncPlayer } from '../hooks/useSyncPlayer.js'
import { parseYouTubeId } from '../lib/youtube.js'
import { supabase } from '../lib/supabase.js'

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const total = Math.floor(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function VideoPlayer({ room, isHost }) {
  const containerRef = useRef(null)
  const [videoId, setVideoId] = useState(() => parseYouTubeId(room.video_url))
  const [urlInput, setUrlInput] = useState(room.video_url || '')
  const [urlErr, setUrlErr] = useState(null)

  const yt = useYouTube(containerRef, videoId)
  const { broadcast, lastSyncAt } = useSyncPlayer(room.id, isHost, {
    play: yt.play,
    pause: yt.pause,
    seekTo: yt.seekTo,
    setVideoId: (id) => setVideoId(id),
    getVideoId: () => videoId,
  })

  // Host: broadcast play/pause when YT state changes (driven by user clicks)
  const lastBroadcastRef = useRef({ type: null, t: 0 })
  useEffect(() => {
    if (!isHost || !yt.ready) return
    const now = Date.now()
    if (yt.state === 'playing' || yt.state === 'paused') {
      const type = yt.state === 'playing' ? 'play' : 'pause'
      // dedupe rapid duplicates
      if (
        lastBroadcastRef.current.type === type &&
        now - lastBroadcastRef.current.t < 250
      ) {
        return
      }
      lastBroadcastRef.current = { type, t: now }
      broadcast(type, yt.getCurrentTime())
    }
  }, [yt.state, yt.ready, isHost, broadcast, yt.getCurrentTime])

  // Flash SYNCED badge for ~700ms on each received sync event (guests).
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!lastSyncAt) return
    setFlash(true)
    const id = setTimeout(() => setFlash(false), 700)
    return () => clearTimeout(id)
  }, [lastSyncAt])

  async function handleLoadUrl(e) {
    e.preventDefault()
    setUrlErr(null)
    if (!isHost) return
    const id = parseYouTubeId(urlInput)
    if (!id) {
      setUrlErr('Could not parse a YouTube URL.')
      return
    }
    setVideoId(id)
    // Tell guests to load this video right now.
    broadcast('video', 0, { videoId: id })
    // Best-effort persist on the room so refreshing guests see it. RLS may
    // reject this if no update policy is in place — that's fine, the
    // broadcast above already covers live guests.
    const { error } = await supabase
      .from('rooms')
      .update({ video_url: urlInput.trim() })
      .eq('id', room.id)
    if (error) console.warn('[VideoPlayer] update video_url failed', error)
  }

  function togglePlay() {
    if (!isHost) return
    if (yt.state === 'playing') yt.pause()
    else yt.play()
  }

  function onSeek(e) {
    if (!isHost) return
    const t = Number(e.target.value)
    yt.seekTo(t, true)
    broadcast('seek', t)
  }

  const playing = yt.state === 'playing'
  const dimmed = !isHost ? 'opacity-60 pointer-events-none' : ''

  return (
    <div>
      {/* URL input (host only) */}
      <form
        onSubmit={handleLoadUrl}
        className={`flex gap-2 ${!isHost ? 'opacity-60' : ''}`}
      >
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          disabled={!isHost}
          placeholder={
            isHost
              ? 'Paste a YouTube URL (youtube.com/watch?v=… or youtu.be/…)'
              : 'Only the host can change the video'
          }
          className="min-h-[44px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-fuchsia-400 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!isHost}
          className="min-h-[44px] rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Load
        </button>
      </form>
      {urlErr && <div className="mt-2 text-sm text-red-400">{urlErr}</div>}

      {/* 16:9 player */}
      <div className="relative mt-4 w-full overflow-hidden rounded-xl bg-black">
        <div className="relative" style={{ paddingTop: '56.25%' }}>
          <div ref={containerRef} className="absolute inset-0" />
          {!videoId && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
              {isHost
                ? 'Paste a YouTube URL above to start.'
                : 'Waiting for the host to load a video…'}
            </div>
          )}
          {/* Guest click-blocker: absorbs all interaction with the YT
              iframe so guests can't play/pause/seek locally. The host
              has full control. */}
          {!isHost && videoId && (
            <div
              className="absolute inset-0 z-10 cursor-not-allowed"
              title="Only the host can control playback"
              onClick={(e) => e.preventDefault()}
            />
          )}
          {/* SYNCED badge */}
          <div
            className={
              'absolute right-3 top-3 z-20 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wider transition ' +
              (flash
                ? 'bg-green-500 text-black shadow-lg shadow-green-500/40'
                : 'bg-zinc-800/70 text-zinc-400')
            }
          >
            {flash ? 'SYNCED' : isHost ? 'HOST' : 'LIVE'}
          </div>
        </div>
      </div>

      {/* Custom controls */}
      <div className={'mt-3 flex items-center gap-3 ' + dimmed}>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!isHost || !yt.ready || !videoId}
          className="min-h-[44px] min-w-[80px] rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="w-20 text-right font-mono text-xs text-zinc-400">
          {formatTime(yt.currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(yt.duration, 0.0001)}
          step={0.1}
          value={Math.min(yt.currentTime, yt.duration || 0)}
          onChange={onSeek}
          disabled={!isHost || !yt.ready || !yt.duration}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-fuchsia-500 disabled:cursor-not-allowed"
        />
        <span className="w-20 font-mono text-xs text-zinc-400">
          {formatTime(yt.duration)}
        </span>
      </div>

      {!isHost && (
        <div className="mt-2 text-xs text-zinc-500">
          Controls are read-only — only the host can play, pause, and seek.
        </div>
      )}
    </div>
  )
}
