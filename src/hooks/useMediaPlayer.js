import { useEffect, useRef, useState, useCallback } from 'react'
import { loadYouTubeAPI } from '../lib/youtube.js'
import { loadTwitchAPI } from '../lib/twitch.js'
import { loadVimeoAPI } from '../lib/vimeo.js'

/**
 * useMediaPlayer
 *
 * Unified player hook that mounts the right embed/player for the given
 * `media` object (output of `parseMediaUrl`). Exposes a uniform control
 * surface so the rest of the UI doesn't care what platform is playing.
 *
 * @param {React.RefObject<HTMLElement>} containerRef
 * @param {object|null} media   { kind, id, url, ... } or null
 *
 * Returns: {
 *   ready, state, duration, currentTime,
 *   play, pause, seekTo, getCurrentTime, getState, supportsSync
 * }
 */
export function useMediaPlayer(containerRef, media) {
  const playerRef = useRef(null)        // backend-specific player handle
  const adapterRef = useRef(null)       // {play, pause, seekTo, ...}
  const kindRef = useRef(null)          // current backend kind
  const idRef = useRef(null)            // current media id
  const teardownFnRef = useRef(null)    // cleanup for the current build

  const [ready, setReady] = useState(false)
  const [state, setState] = useState('unstarted')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  // Build/swap the player whenever media changes.
  useEffect(() => {
    if (!media) {
      teardown()
      return
    }
    if (!containerRef.current) return

    const sameKind = kindRef.current === media.kind
    const sameId = idRef.current === media.id

    // Same media — nothing to do.
    if (sameKind && sameId && adapterRef.current) return

    // Same backend, different media — let the adapter swap the source.
    if (sameKind && adapterRef.current?.loadMedia) {
      try { adapterRef.current.loadMedia(media) } catch (err) {
        console.warn('[useMediaPlayer] loadMedia failed; rebuilding', err)
        teardown()
        build(media)
        return
      }
      idRef.current = media.id
      setCurrentTime(0)
      return
    }

    // Different backend — full rebuild.
    teardown()
    build(media)

    function build(m) {
      const cleanupRef = { cancelled: false }
      kindRef.current = m.kind
      idRef.current = m.id
      setReady(false)
      setState('unstarted')
      setDuration(0)
      setCurrentTime(0)

      const handlers = {
        onReady: (info = {}) => {
          if (cleanupRef.cancelled) return
          setReady(true)
          if (info.duration) setDuration(info.duration)
        },
        onState: (s) => setState(s),
        onDuration: (d) => { if (d) setDuration(d) },
      }

      const builder = BUILDERS[m.kind]
      if (!builder) {
        console.error('[useMediaPlayer] unsupported kind:', m.kind)
        return
      }

      // Stash the cancellation flag so async builders can bail.
      builder(containerRef.current, m, handlers, cleanupRef).then((adapter) => {
        if (cleanupRef.cancelled) {
          try { adapter?.destroy?.() } catch { /* */ }
          return
        }
        adapterRef.current = adapter
        playerRef.current = adapter
      }).catch((err) => {
        console.error('[useMediaPlayer] failed to build', m.kind, err)
      })

      // Cleanup function for THIS build (closes over cleanupRef).
      teardownFnRef.current = () => {
        cleanupRef.cancelled = true
        try { adapterRef.current?.destroy?.() } catch { /* */ }
        adapterRef.current = null
        playerRef.current = null
        kindRef.current = null
        idRef.current = null
      }
    }

    function teardown() {
      if (teardownFnRef.current) {
        teardownFnRef.current()
        teardownFnRef.current = null
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
      setReady(false)
      setState('unstarted')
      setDuration(0)
      setCurrentTime(0)
    }
  }, [media?.kind, media?.id, media?.url])

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (teardownFnRef.current) {
        teardownFnRef.current()
        teardownFnRef.current = null
      }
    }
  }, [])

  // Poll currentTime/duration while ready (for backends that don't push it)
  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => {
      const a = adapterRef.current
      if (!a) return
      try {
        const t = a.getCurrentTime?.()
        if (typeof t === 'number') setCurrentTime(t)
        const d = a.getDuration?.()
        if (typeof d === 'number' && d) setDuration(d)
      } catch { /* */ }
    }, 500)
    return () => clearInterval(id)
  }, [ready])

  const play = useCallback(() => {
    try { adapterRef.current?.play?.() } catch { /* */ }
  }, [])
  const pause = useCallback(() => {
    try { adapterRef.current?.pause?.() } catch { /* */ }
  }, [])
  const seekTo = useCallback((seconds) => {
    try { adapterRef.current?.seekTo?.(seconds) } catch { /* */ }
  }, [])
  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0))
    try { adapterRef.current?.setVolume?.(clamped) } catch { /* */ }
  }, [])
  const setMuted = useCallback((m) => {
    try { adapterRef.current?.setMuted?.(!!m) } catch { /* */ }
  }, [])
  const getCurrentTime = useCallback(() => {
    try { return adapterRef.current?.getCurrentTime?.() ?? 0 } catch { return 0 }
  }, [])
  const getState = useCallback(() => state, [state])

  return {
    ready,
    state,
    duration,
    currentTime,
    play,
    pause,
    seekTo,
    setVolume,
    setMuted,
    getCurrentTime,
    getState,
    supportsVolume: media?.kind !== 'drive',
    supportsSync: media?.supportsSync !== false,
  }
}

/* ----------------------------------------------------------------------- */
/*  Backend builders                                                        */
/*  Each returns a Promise<adapter> with a uniform shape:                   */
/*    { destroy, play, pause, seekTo, getCurrentTime, getDuration,          */
/*      loadMedia? }                                                        */
/* ----------------------------------------------------------------------- */

const BUILDERS = {
  youtube:  buildYouTube,
  twitch:   buildTwitch,
  vimeo:    buildVimeo,
  direct:   buildDirect,
  drive:    buildDrive,
}

const STATE_MAP_YT = {
  '-1': 'unstarted', 0: 'ended', 1: 'playing',
  2: 'paused', 3: 'buffering', 5: 'cued',
}

async function buildYouTube(container, media, handlers, cleanupRef) {
  const YT = await loadYouTubeAPI()
  if (cleanupRef.cancelled) return null

  const mount = document.createElement('div')
  mount.id = 'yt-player-' + Math.random().toString(36).slice(2, 8)
  container.innerHTML = ''
  container.appendChild(mount)

  let player
  await new Promise((resolve) => {
    player = new YT.Player(mount.id, {
      width: '100%',
      height: '100%',
      videoId: media.id,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: 0, disablekb: 1 },
      events: {
        onReady: (e) => {
          let d = 0
          try { d = e.target.getDuration() || 0 } catch { /* */ }
          handlers.onReady({ duration: d })
          resolve()
        },
        onStateChange: (e) => {
          handlers.onState(STATE_MAP_YT[e.data] || 'unstarted')
          try { handlers.onDuration(e.target.getDuration?.() || 0) } catch { /* */ }
        },
      },
    })
  })

  return {
    destroy: () => { try { player.destroy() } catch { /* */ } },
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seekTo: (s) => player.seekTo(s, true),
    setVolume: (v) => { try { player.setVolume(Math.round(v * 100)) } catch { /* */ } },
    setMuted: (m) => { try { m ? player.mute() : player.unMute() } catch { /* */ } },
    getCurrentTime: () => player.getCurrentTime?.() || 0,
    getDuration: () => player.getDuration?.() || 0,
    loadMedia: (m) => player.cueVideoById(m.id),
  }
}

async function buildTwitch(container, media, handlers, cleanupRef) {
  const Twitch = await loadTwitchAPI()
  if (cleanupRef.cancelled) return null

  const mount = document.createElement('div')
  mount.style.width = '100%'
  mount.style.height = '100%'
  container.innerHTML = ''
  container.appendChild(mount)

  // Twitch requires the embedding hostname(s) listed in `parent`.
  const parent = [window.location.hostname]

  const opts = {
    width: '100%',
    height: '100%',
    autoplay: false,
    muted: false,
    parent,
  }
  if (media.twitchType === 'video')      opts.video   = media.id
  else if (media.twitchType === 'clip')  opts.collection = undefined, opts.clip = media.id
  else                                    opts.channel = media.channel || media.id

  const player = new Twitch.Player(mount, opts)

  await new Promise((resolve) => {
    let resolved = false
    const finish = () => { if (!resolved) { resolved = true; resolve() } }
    player.addEventListener(Twitch.Player.READY, () => {
      let d = 0
      try { d = player.getDuration?.() || 0 } catch { /* */ }
      handlers.onReady({ duration: d })
      finish()
    })
    player.addEventListener(Twitch.Player.PLAY,    () => handlers.onState('playing'))
    player.addEventListener(Twitch.Player.PAUSE,   () => handlers.onState('paused'))
    player.addEventListener(Twitch.Player.ENDED,   () => handlers.onState('ended'))
    // Safety timeout — Twitch sometimes silently fails to fire READY.
    setTimeout(finish, 4000)
  })

  return {
    destroy: () => { try { mount.innerHTML = '' } catch { /* */ } },
    play: () => player.play(),
    pause: () => player.pause(),
    seekTo: (s) => { try { player.seek(s) } catch { /* */ } },
    setVolume: (v) => { try { player.setVolume(v) } catch { /* */ } },
    setMuted: (m) => { try { player.setMuted(m) } catch { /* */ } },
    getCurrentTime: () => { try { return player.getCurrentTime() || 0 } catch { return 0 } },
    getDuration: () => { try { return player.getDuration() || 0 } catch { return 0 } },
    // No fast loadMedia — fall through to rebuild.
  }
}

async function buildVimeo(container, media, handlers, cleanupRef) {
  const Vimeo = await loadVimeoAPI()
  if (cleanupRef.cancelled) return null

  const mount = document.createElement('div')
  mount.style.width = '100%'
  mount.style.height = '100%'
  container.innerHTML = ''
  container.appendChild(mount)

  const player = new Vimeo.Player(mount, {
    id: Number(media.id),
    width: '100%',
    responsive: false,
    controls: false,
    dnt: true,
  })

  // Cache async-only values synchronously via the timeupdate event.
  const cache = { t: 0, d: 0 }
  player.on('timeupdate', (e) => {
    if (typeof e.seconds === 'number') cache.t = e.seconds
    if (typeof e.duration === 'number' && e.duration) cache.d = e.duration
  })
  player.on('play',    () => handlers.onState('playing'))
  player.on('pause',   () => handlers.onState('paused'))
  player.on('ended',   () => handlers.onState('ended'))
  player.on('bufferstart', () => handlers.onState('buffering'))

  await player.ready()
  try { cache.d = (await player.getDuration()) || 0 } catch { /* */ }
  handlers.onReady({ duration: cache.d })

  return {
    destroy: () => { try { player.destroy() } catch { /* */ } },
    play: () => player.play(),
    pause: () => player.pause(),
    seekTo: (s) => player.setCurrentTime(s),
    setVolume: (v) => { try { player.setVolume(v) } catch { /* */ } },
    setMuted: (m) => { try { player.setMuted(m) } catch { /* */ } },
    getCurrentTime: () => cache.t,
    getDuration: () => cache.d,
    loadMedia: async (m) => {
      await player.loadVideo(Number(m.id))
      cache.t = 0
    },
  }
}

async function buildDirect(container, media, handlers /* , cleanupRef */) {
  const video = document.createElement('video')
  video.src = media.url
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.background = 'black'
  video.controls = false
  video.playsInline = true
  video.preload = 'metadata'

  container.innerHTML = ''
  container.appendChild(video)

  // Some servers (archive.org, etc.) report Infinity/NaN duration until the
  // browser has scanned more of the file. Cache the latest valid value so the
  // UI's seek bar doesn't collapse to 0.
  const cache = { duration: 0 }
  const updateDuration = () => {
    const d = video.duration
    if (Number.isFinite(d) && d > 0) {
      cache.duration = d
      handlers.onDuration(d)
    }
  }

  video.addEventListener('play',     () => { console.log('[direct] play event @', video.currentTime); handlers.onState('playing') })
  video.addEventListener('playing',  () => { console.log('[direct] playing event @', video.currentTime); handlers.onState('playing') })
  video.addEventListener('pause',    () => { console.log('[direct] pause event @', video.currentTime); handlers.onState('paused') })
  video.addEventListener('ended',    () => { console.log('[direct] ended'); handlers.onState('ended') })
  video.addEventListener('waiting',  () => { console.log('[direct] waiting (buffering)'); handlers.onState('buffering') })
  video.addEventListener('seeking',  () => { console.log('[direct] seeking →', video.currentTime) })
  video.addEventListener('seeked',   () => { console.log('[direct] seeked →', video.currentTime, 'paused=', video.paused) })
  video.addEventListener('stalled',  () => { console.log('[direct] stalled') })
  video.addEventListener('loadedmetadata', () => {
    updateDuration()
    handlers.onReady({ duration: cache.duration })
  })
  video.addEventListener('durationchange', updateDuration)
  video.addEventListener('progress',       updateDuration)
  video.addEventListener('canplay',        updateDuration)
  video.addEventListener('error', () => {
    const err = video.error
    console.warn('[direct video] error', err && err.code, err && err.message)
  })

  return {
    destroy: () => {
      try { video.pause() } catch { /* */ }
      video.removeAttribute('src')
      try { video.load() } catch { /* */ }
      video.remove()
    },
    play: () => video.play().catch((e) => console.warn('[direct video] play blocked', e)),
    pause: () => video.pause(),
    setVolume: (v) => { video.volume = Math.max(0, Math.min(1, v)) },
    setMuted: (m) => { video.muted = !!m },
    seekTo: (s) => {
      try {
        const max = cache.duration || video.duration
        const target = Number.isFinite(max) && max > 0
          ? Math.min(Math.max(s, 0), max - 0.05)
          : Math.max(s, 0)
        video.currentTime = target
      } catch (e) {
        console.warn('[direct video] seek failed', e)
      }
    },
    getCurrentTime: () => video.currentTime || 0,
    getDuration: () => {
      const d = video.duration
      return Number.isFinite(d) && d > 0 ? d : cache.duration
    },
    loadMedia: (m) => {
      cache.duration = 0
      video.src = m.url
      try { video.load() } catch { /* */ }
    },
  }
}

async function buildDrive(container, media, handlers /* , cleanupRef */) {
  // Google Drive has no public JS player API. We embed the preview iframe
  // and treat playback as un-controllable from our app — host & guests will
  // each play the video on their own.
  const iframe = document.createElement('iframe')
  iframe.src = `https://drive.google.com/file/d/${media.id}/preview`
  iframe.style.width = '100%'
  iframe.style.height = '100%'
  iframe.style.border = '0'
  iframe.allow = 'autoplay; fullscreen'

  container.innerHTML = ''
  container.appendChild(iframe)

  // Mark "ready" immediately so the controls don't sit disabled forever.
  setTimeout(() => handlers.onReady({ duration: 0 }), 100)

  return {
    destroy: () => { try { iframe.remove() } catch { /* */ } },
    play:  () => { /* unsupported */ },
    pause: () => { /* unsupported */ },
    seekTo: () => { /* unsupported */ },
    getCurrentTime: () => 0,
    getDuration: () => 0,
    loadMedia: (m) => {
      iframe.src = `https://drive.google.com/file/d/${m.id}/preview`
    },
  }
}
