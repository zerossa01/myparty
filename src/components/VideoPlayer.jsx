import { useEffect, useMemo, useRef, useState } from 'react'
import { useMediaPlayer } from '../hooks/useMediaPlayer.js'
import { useSyncPlayer } from '../hooks/useSyncPlayer.js'
import { parseMediaUrl, mediaLabel } from '../lib/media.js'
import { supabase } from '../lib/supabase.js'
import SourceTabs from './SourceTabs.jsx'
import YouTubeBrowser from './YouTubeBrowser.jsx'
import SubtitleOverlay from './SubtitleOverlay.jsx'
import { parseSrt } from '../lib/srt.js'
import {
  listHistory, addHistory, removeHistory, clearHistory, enrichHistory,
  entryDisplay, timeAgo,
} from '../lib/history.js'

const URL_PLACEHOLDERS = {
  youtube: 'Paste a YouTube URL — or use search above',
  twitch:  'Paste a Twitch channel, VOD, or clip URL (twitch.tv/…)',
  vimeo:   'Paste a Vimeo URL (vimeo.com/…)',
  direct:  'Paste a direct video URL (.mp4 / .webm / .mov / .m3u8)',
  drive:   'Paste a public Google Drive video link (drive.google.com/file/d/…)',
  iframe:  'Paste any embed URL (streamimdb.ru/embed/…, vidsrc, anime sites, …)',
}

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
  const playerWrapRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mediaUrl, setMediaUrl] = useState(room.video_url || '')
  const [urlInput, setUrlInput] = useState(room.video_url || '')
  const [urlErr, setUrlErr] = useState(null)
  const [activeTab, setActiveTab] = useState('youtube')
  const [cues, setCues] = useState(null)
  const [subName, setSubName] = useState('')
  const [subOffset, setSubOffset] = useState(0) // seconds
  const [subErr, setSubErr] = useState(null)
  // Volume is local per-viewer. Persist across reloads via localStorage.
  const [volume, setVolumeState] = useState(() => {
    const v = Number(localStorage.getItem('rc_volume'))
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1
  })
  const [muted, setMutedState] = useState(() => localStorage.getItem('rc_muted') === '1')
  const [history, setHistory] = useState(() => listHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [showSubs, setShowSubs] = useState(false)
  // Source drawer (tabs + search + URL paste + history). Auto-open when there
  // is no media yet so the host knows what to do; collapses once a video loads.
  const [sourceOpen, setSourceOpen] = useState(true)

  const media = useMemo(() => parseMediaUrl(mediaUrl), [mediaUrl])
  const yt = useMediaPlayer(containerRef, media)
  const { broadcast, lastSyncAt } = useSyncPlayer(room.id, isHost, {
    play: yt.play,
    pause: yt.pause,
    seekTo: yt.seekTo,
    setMediaUrl: (url) => { setMediaUrl(url); setUrlInput(url) },
    getMediaUrl: () => mediaUrl,
    setCues: (newCues, name) => { setCues(newCues); setSubName(name || '') },
    getCues: () => cues,
    getSubName: () => subName,
  })

  // Host: broadcast play/pause when player state changes (driven by user clicks)
  const lastBroadcastRef = useRef({ type: null, t: 0 })
  useEffect(() => {
    if (!isHost || !yt.ready || !yt.supportsSync) return
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
  }, [yt.state, yt.ready, yt.supportsSync, isHost, broadcast, yt.getCurrentTime])

  // Flash SYNCED badge for ~700ms on each received sync event (guests).
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!lastSyncAt) return
    setFlash(true)
    const id = setTimeout(() => setFlash(false), 700)
    return () => clearTimeout(id)
  }, [lastSyncAt])

  // Shared: load an arbitrary URL (used by both the paste form and the
  // YouTube search result clicks).
  async function loadUrl(rawUrl) {
    if (!isHost) return
    setUrlErr(null)
    const trimmed = String(rawUrl || '').trim()
    const parsed = parseMediaUrl(trimmed)
    if (!parsed) {
      setUrlErr('Unsupported link. Try YouTube, Twitch, Vimeo, a direct .mp4/.webm URL, or a public Google Drive video.')
      return
    }
    setMediaUrl(trimmed)
    setUrlInput(trimmed)
    // Save to per-user history.
    setHistory(addHistory(parsed, mediaLabel(parsed)))
    // Tell guests to load this media right now.
    broadcast('video', 0, { mediaUrl: trimmed })
    // Best-effort persist on the room so refreshing guests see it.
    const { error } = await supabase
      .from('rooms')
      .update({ video_url: trimmed })
      .eq('id', room.id)
    if (error) console.warn('[VideoPlayer] update video_url failed', error)
  }

  function handleHistoryPick(entry) {
    setShowHistory(false)
    loadUrl(entry.url)
  }

  function handleHistoryRemove(e, url) {
    e.stopPropagation()
    setHistory(removeHistory(url))
  }

  function handleHistoryClear() {
    if (window.confirm('Clear your watch history? This only affects your device.')) {
      setHistory(clearHistory())
      setShowHistory(false)
    }
  }

  async function handleLoadUrl(e) {
    e.preventDefault()
    await loadUrl(urlInput)
  }

  async function handleSrtUpload(e) {
    setSubErr(null)
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-uploading the same filename
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setSubErr('Subtitle file too large (max 2 MB).')
      return
    }
    try {
      const text = await file.text()
      const parsed = parseSrt(text)
      if (!parsed.length) {
        setSubErr("Couldn't parse any subtitle lines from that file.")
        return
      }
      setCues(parsed)
      setSubName(file.name)
      // Push to all guests.
      broadcast('subtitles', 0, { cues: parsed, subName: file.name })
    } catch (err) {
      setSubErr('Failed to read subtitle file: ' + (err?.message || err))
    }
  }

  function clearSubtitles() {
    setCues(null)
    setSubName('')
    setSubOffset(0)
    setSubErr(null)
    broadcast('subtitles', 0, { cues: [], subName: '' })
  }

  function togglePlay() {
    if (!isHost) return
    console.log('[VideoPlayer] togglePlay clicked, current state =', yt.state)
    if (yt.state === 'playing') yt.pause()
    else yt.play()
  }

  function onSeek(e) {
    if (!isHost) return
    const t = Number(e.target.value)
    console.log('[VideoPlayer] seek to', t, 'state=', yt.state)
    yt.seekTo(t, true)
    broadcast('seek', t)
  }

  function handleVolumeChange(e) {
    const v = Number(e.target.value)
    setVolumeState(v)
    if (muted && v > 0) setMutedState(false)
    localStorage.setItem('rc_volume', String(v))
  }

  function toggleMute() {
    setMutedState((m) => {
      const next = !m
      localStorage.setItem('rc_muted', next ? '1' : '0')
      return next
    })
  }

  // Push volume/muted to the adapter whenever they change OR a new media
  // becomes ready (so newly-built players adopt the user's saved volume).
  useEffect(() => {
    if (!yt.ready) return
    yt.setVolume(volume)
    yt.setMuted(muted)
  }, [volume, muted, yt.ready, yt.setVolume, yt.setMuted])

  // Enrich history (fetch titles / thumbnails) the first time the panel
  // opens — and refresh after every successful video load.
  useEffect(() => {
    if (!showHistory) return
    enrichHistory((updated) => setHistory([...updated]))
  }, [showHistory])

  useEffect(() => {
    // Re-run enrichment in the background whenever a new entry is added,
    // so its title/thumb get filled in even before the user opens the panel.
    enrichHistory((updated) => setHistory([...updated]))
    // Auto-collapse the source drawer once a real video is loaded.
    if (mediaUrl) setSourceOpen(false)
  }, [mediaUrl])

  // External media changes (vote-skip clears, host-transferred-then-loaded,
  // initial value coming through after a refresh): keep our local state in
  // sync with the canonical room.video_url whenever it changes from outside.
  useEffect(() => {
    const incoming = room.video_url || ''
    if (incoming !== mediaUrl) {
      setMediaUrl(incoming)
      setUrlInput(incoming)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.video_url])

  // Track the browser's fullscreen state so the icon stays in sync when
  // the user exits via the Escape key or the native UI.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (playerWrapRef.current?.requestFullscreen) {
        await playerWrapRef.current.requestFullscreen()
      } else {
        // iOS Safari: the <video> itself has webkitEnterFullscreen.
        const v = playerWrapRef.current?.querySelector('video')
        if (v && typeof v.webkitEnterFullscreen === 'function') {
          v.webkitEnterFullscreen()
        }
      }
    } catch (err) {
      console.warn('[fullscreen] toggle failed', err)
    }
  }

  const playing = yt.state === 'playing'
  const supportsSync = yt.supportsSync

  // Controls bar — rendered both below the video (normal) AND as an overlay
  // on top of the video (fullscreen). Extracted so the markup stays in sync.
  const controlsBar = (
    <div
      className={
        isFullscreen
          ? 'pointer-events-auto absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-4 pt-10 text-white'
          : 'mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-white backdrop-blur'
      }
    >
      {/* Seek row (full-width) */}
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-left font-mono text-[11px] tabular-nums text-zinc-300">
          {formatTime(yt.currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(yt.duration, 0.0001)}
          step={0.1}
          value={Math.min(yt.currentTime, yt.duration || 0)}
          onChange={onSeek}
          disabled={!isHost || !yt.ready || !yt.duration || !supportsSync}
          className={
            'h-1.5 flex-1 appearance-none rounded-full bg-white/15 accent-fuchsia-500 ' +
            (!isHost ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer')
          }
        />
        <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-300">
          {formatTime(yt.duration)}
        </span>
      </div>

      {/* Button row */}
      <div className="mt-1 flex items-center gap-2">
        <IconButton
          onClick={togglePlay}
          disabled={!isHost || !yt.ready || !media || !supportsSync}
          title={playing ? 'Pause' : 'Play'}
          primary
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>

        {/* Volume (per-viewer, always interactive) */}
        {yt.supportsVolume && (
          <div className="group/volume flex items-center">
            <IconButton
              onClick={toggleMute}
              disabled={!yt.ready}
              title={muted || volume === 0 ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <VolumeMutedIcon />
                : volume < 0.5       ? <VolumeLowIcon />
                                     : <VolumeHighIcon />}
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              disabled={!yt.ready}
              title="Volume"
              className="ml-1 h-1.5 w-0 cursor-pointer appearance-none rounded-full bg-white/15 accent-fuchsia-500 opacity-0 transition-all duration-200 group-hover/volume:w-20 group-hover/volume:opacity-100 focus:w-20 focus:opacity-100 disabled:cursor-not-allowed"
            />
          </div>
        )}

        <span className="ml-auto shrink-0 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          {mediaLabel(media)}
        </span>

        {/* Subtitles menu (host only) */}
        {isHost && (
          <div className="relative">
            <IconButton
              onClick={() => setShowSubs((v) => !v)}
              title={cues?.length ? `Subtitles · ${cues.length} cues` : 'Upload subtitles'}
            >
              <CcIcon active={!!cues?.length} />
            </IconButton>
            {showSubs && (
              <div
                className={
                  'absolute right-0 z-40 w-60 rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur ' +
                  (isFullscreen ? 'bottom-full mb-2' : 'bottom-full mb-2')
                }
              >
                <label className="flex min-h-[36px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-fuchsia-500">
                  📝 <span>{cues?.length ? 'Replace .srt' : 'Upload .srt'}</span>
                  <input
                    type="file"
                    accept=".srt,application/x-subrip,text/plain"
                    className="hidden"
                    onChange={handleSrtUpload}
                  />
                </label>
                {cues?.length > 0 && (
                  <>
                    <div className="mt-2 truncate text-[10px] text-zinc-500">
                      {subName || 'subtitles'} · {cues.length} cues
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-300">
                      <span className="text-[11px] text-zinc-500">Offset</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSubOffset((o) => o - 0.5)}
                          className="h-7 w-7 rounded bg-zinc-800 hover:bg-zinc-700"
                          title="Subtitles appear 0.5s earlier"
                        >−</button>
                        <span className="w-12 text-center font-mono">{subOffset.toFixed(1)}s</span>
                        <button
                          type="button"
                          onClick={() => setSubOffset((o) => o + 0.5)}
                          className="h-7 w-7 rounded bg-zinc-800 hover:bg-zinc-700"
                          title="Subtitles appear 0.5s later"
                        >+</button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { clearSubtitles(); setShowSubs(false) }}
                      className="mt-2 w-full rounded-lg bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-red-600 hover:text-white"
                    >
                      Clear subtitles
                    </button>
                  </>
                )}
                {subErr && <div className="mt-2 text-[11px] text-red-400">{subErr}</div>}
              </div>
            )}
          </div>
        )}

        {/* Fullscreen (per-viewer) */}
        {media && (
          <IconButton
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </IconButton>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {/* PLAYER AREA — fills available space, dark, cinematic. */}
      <div
        ref={playerWrapRef}
        className="relative flex min-h-0 flex-1 items-center justify-center bg-black"
      >
        {/* 16:9 player constrained to the available area */}
        <div
          className="relative"
          style={
            isFullscreen
              ? { width: '100vw', height: '100vh' }
              : { width: '100%', maxWidth: 'min(100%, calc((100vh - 8rem) * 16 / 9))', aspectRatio: '16 / 9' }
          }
        >
          <div ref={containerRef} className="absolute inset-0" />
          <SubtitleOverlay cues={cues} currentTime={yt.currentTime} offset={subOffset} />

          {!media && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-zinc-500">
              <span className="text-4xl">🎬</span>
              <span>
                {isHost
                  ? 'Pick a source above to start watching.'
                  : 'Waiting for the host to load a video…'}
              </span>
            </div>
          )}

          {/* Guest click-blocker */}
          {!isHost && media && supportsSync && (
            <div
              className="absolute inset-0 z-10 cursor-not-allowed"
              title="Only the host can control playback"
              onClick={(e) => e.preventDefault()}
            />
          )}

          {/* Top-right SYNC flash — only shows briefly on sync events. */}
          {flash && (
            <div className="absolute right-3 top-3 z-20 rounded-full bg-green-500 px-2.5 py-1 text-[10px] font-bold tracking-wider text-black shadow-lg shadow-green-500/40">
              SYNCED
            </div>
          )}

          {/* Fullscreen controls overlay */}
          {isFullscreen && controlsBar}
        </div>

        {/* Floating change-source button — icon-only, shows only when a video
            is loaded (otherwise the source drawer is already open). */}
        {isHost && !isFullscreen && mediaUrl && !sourceOpen && (
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            className="absolute left-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700/70 bg-black/60 text-zinc-200 backdrop-blur transition hover:border-fuchsia-500/60 hover:text-fuchsia-200"
            title="Change media source"
            aria-label="Change media source"
          >
            <LinkIcon />
          </button>
        )}

        {/* SOURCE DRAWER — slides down from the top of the player area */}
        {isHost && sourceOpen && !isFullscreen && (
          <div className="absolute inset-x-0 top-0 z-40 max-h-full overflow-y-auto border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Load a video
              </span>
              <button
                type="button"
                onClick={() => setSourceOpen(false)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Close"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="space-y-3 p-3">
              <SourceTabs value={activeTab} onChange={setActiveTab} disabled={!isHost} />

              {activeTab === 'youtube' && (
                <YouTubeBrowser onPick={loadUrl} disabled={!isHost} />
              )}

              <form onSubmit={handleLoadUrl} className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={URL_PLACEHOLDERS[activeTab] || 'Paste a video URL'}
                  className="min-h-[40px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-fuchsia-400"
                />
                <button
                  type="submit"
                  className="min-h-[40px] rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold hover:bg-fuchsia-400"
                >
                  Load
                </button>
              </form>
              {urlErr && <div className="text-sm text-red-400">{urlErr}</div>}

              {/* History inline grid */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-600"
                >
                  🕘 <span>History</span>
                  {history.length > 0 && (
                    <span className="rounded-full bg-fuchsia-500/20 px-1.5 text-[10px] text-fuchsia-300">
                      {history.length}
                    </span>
                  )}
                </button>
                {showHistory && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
                    {history.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-zinc-500">
                        Nothing here yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {history.map((entry) => (
                          <HistoryCard
                            key={entry.url}
                            entry={entry}
                            onPick={(e) => { handleHistoryPick(e); setSourceOpen(false) }}
                            onRemove={handleHistoryRemove}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {media && !supportsSync && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  ⚠️ {mediaLabel(media)} videos can't be synced — each viewer plays
                  independently.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls bar — overlayed at the bottom of the player when not fullscreen */}
      {!isFullscreen && (
        <div className="border-t border-zinc-900 bg-zinc-950 px-3 py-2">
          {controlsBar}
        </div>
      )}

      {!isHost && !media && (
        <div className="px-3 py-2 text-center text-xs text-zinc-500">
          Controls are read-only — only the host can play, pause, and seek.
        </div>
      )}
    </div>
  )
}

/* ---------- Player control primitives ---------- */

function IconButton({ children, onClick, disabled, title, primary }) {
  const base =
    'inline-flex items-center justify-center rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed'
  const style = primary
    ? 'h-10 w-10 bg-fuchsia-500 text-white hover:bg-fuchsia-400 shadow-lg shadow-fuchsia-500/30'
    : 'h-9 w-9 text-white/90 hover:bg-white/10'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`${base} ${style}`}
    >
      {children}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 001.55.83l10.36-6.86a1 1 0 000-1.66L9.55 4.31A1 1 0 008 5.14z" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <rect x="6"  y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}
function VolumeHighIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M3 10v4a1 1 0 001 1h3l4 4a1 1 0 001.7-.7V5.7A1 1 0 0011 5l-4 4H4a1 1 0 00-1 1z" />
      <path d="M16.5 12a4.5 4.5 0 00-2.3-3.9v7.8A4.5 4.5 0 0016.5 12z" />
      <path d="M14.2 3.2v2.1A7 7 0 0119 12a7 7 0 01-4.8 6.7v2.1A9 9 0 0021 12a9 9 0 00-6.8-8.8z" />
    </svg>
  )
}
function VolumeLowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M3 10v4a1 1 0 001 1h3l4 4a1 1 0 001.7-.7V5.7A1 1 0 0011 5l-4 4H4a1 1 0 00-1 1z" />
      <path d="M16.5 12a4.5 4.5 0 00-2.3-3.9v7.8A4.5 4.5 0 0016.5 12z" />
    </svg>
  )
}
function VolumeMutedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M3 10v4a1 1 0 001 1h3l4 4a1 1 0 001.7-.7V5.7A1 1 0 0011 5l-4 4H4a1 1 0 00-1 1z" />
      <path d="M21.5 9.9l-1.4-1.4-2.6 2.6-2.6-2.6-1.4 1.4 2.6 2.6-2.6 2.6 1.4 1.4 2.6-2.6 2.6 2.6 1.4-1.4-2.6-2.6z" />
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M3.9 12a3.1 3.1 0 013.1-3.1h4v-2H7a5.1 5.1 0 100 10.2h4v-2H7A3.1 3.1 0 013.9 12zm5.1 1h6v-2H9v2zm8-7h-4v2h4a3.1 3.1 0 010 6.2h-4v2h4A5.1 5.1 0 0017 6z" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3l-1.4-1.4L10.6 12 5.7 5.7l1.4-1.4L12 10.6l4.9-4.9z" />
    </svg>
  )
}

function CcIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect
        x="2" y="5" width="20" height="14" rx="3"
        fill={active ? '#d946ef' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
      />
      <text
        x="12" y="15.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        fill={active ? 'white' : 'currentColor'}
      >CC</text>
    </svg>
  )
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z" />
    </svg>
  )
}
function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M10 5v5H5V8h3V5h2zm4 0h2v3h3v2h-5V5zM5 14h5v5H8v-3H5v-2zm9 0h5v2h-3v3h-2v-5z" />
    </svg>
  )
}

/* ---------- History card ---------- */

const KIND_GRADIENT = {
  youtube: 'from-red-600 to-red-900',
  twitch:  'from-purple-600 to-purple-900',
  vimeo:   'from-sky-600 to-sky-900',
  direct:  'from-fuchsia-700 to-zinc-900',
  drive:   'from-emerald-600 to-emerald-900',
}

function HistoryCard({ entry, onPick, onRemove }) {
  const display = entryDisplay(entry)
  const gradient = KIND_GRADIENT[entry.kind] || 'from-zinc-700 to-zinc-900'
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      title={entry.url}
      className="group relative block overflow-hidden rounded-lg bg-zinc-950 text-left ring-1 ring-zinc-800 transition hover:ring-fuchsia-500"
    >
      {/* 16:9 thumb area */}
      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
        {entry.thumb ? (
          <img
            src={entry.thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}
        {/* dim + play icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
          <span className="text-3xl opacity-0 transition group-hover:opacity-100">▶</span>
        </div>
        {/* kind badge */}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          {entry.kind}
        </span>
        {/* remove button */}
        <button
          type="button"
          onClick={(e) => onRemove(e, entry.url)}
          className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 hover:bg-red-600 group-hover:opacity-100"
          title="Remove from history"
        >
          ✕
        </button>
      </div>
      {/* title + meta */}
      <div className="px-2 py-1.5">
        <div className="line-clamp-2 text-xs font-medium text-zinc-100">
          {display}
        </div>
        <div className="mt-0.5 text-[10px] text-zinc-500">
          {timeAgo(entry.addedAt)}
        </div>
      </div>
    </button>
  )
}
