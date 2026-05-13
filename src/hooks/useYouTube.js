import { useEffect, useRef, useState, useCallback } from 'react'
import { loadYouTubeAPI } from '../lib/youtube.js'

const STATE_MAP = {
  '-1': 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
}

/**
 * useYouTube
 * @param {React.RefObject<HTMLElement>} containerRef  div the player will mount into
 * @param {string|null} videoId                        currently loaded video id
 *
 * Returns { ready, state, duration, currentTime, play, pause, seekTo,
 *           getCurrentTime, getState, loadVideo }
 */
export function useYouTube(containerRef, videoId) {
  const playerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [state, setState] = useState('unstarted')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  // Lazily create the YT.Player the first time we have a videoId.
  // Defer-on-first-video is more reliable than initializing with no video,
  // which can fail silently in some YT API versions / browsers.
  useEffect(() => {
    if (!videoId) return
    if (!containerRef.current) return
    if (playerRef.current) {
      // Player exists — just swap the video.
      try { playerRef.current.cueVideoById(videoId) } catch (err) {
        console.warn('[useYouTube] cueVideoById failed', err)
      }
      return
    }

    let cancelled = false

    loadYouTubeAPI().then((YT) => {
      if (cancelled || !containerRef.current) return
      if (playerRef.current) return // race-guard

      // YT replaces this mount div with an iframe.
      const mount = document.createElement('div')
      mount.id = 'yt-player-' + Math.random().toString(36).slice(2, 8)
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(mount)

      try {
        playerRef.current = new YT.Player(mount.id, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: 0,
            disablekb: 1,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return
              setReady(true)
              try { setDuration(e.target.getDuration() || 0) } catch { /* */ }
            },
            onStateChange: (e) => {
              const s = STATE_MAP[e.data] || 'unstarted'
              setState(s)
              try { setDuration(e.target.getDuration() || 0) } catch { /* */ }
            },
            onError: (e) => {
              console.warn('[useYouTube] player error', e?.data)
            },
          },
        })
      } catch (err) {
        console.error('[useYouTube] failed to create player', err)
      }
    })

    return () => {
      cancelled = true
      try { playerRef.current?.destroy() } catch { /* */ }
      playerRef.current = null
      setReady(false)
    }
    // We deliberately depend on containerRef + videoId. videoId only
    // creates the player on first set; subsequent changes go through the
    // cueVideoById branch above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  // Poll currentTime / duration while ready
  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => {
      const p = playerRef.current
      if (!p) return
      try {
        setCurrentTime(p.getCurrentTime() || 0)
        const d = p.getDuration() || 0
        if (d) setDuration(d)
      } catch { /* */ }
    }, 500)
    return () => clearInterval(id)
  }, [ready])

  const play = useCallback(() => {
    try { playerRef.current?.playVideo() } catch { /* */ }
  }, [])
  const pause = useCallback(() => {
    try { playerRef.current?.pauseVideo() } catch { /* */ }
  }, [])
  const seekTo = useCallback((seconds, allowSeekAhead = true) => {
    try { playerRef.current?.seekTo(seconds, allowSeekAhead) } catch { /* */ }
  }, [])
  const getCurrentTime = useCallback(() => {
    try { return playerRef.current?.getCurrentTime() || 0 } catch { return 0 }
  }, [])
  const getState = useCallback(() => {
    try {
      const code = playerRef.current?.getPlayerState?.()
      return STATE_MAP[code] || 'unstarted'
    } catch { return 'unstarted' }
  }, [])
  const loadVideo = useCallback((id) => {
    try { playerRef.current?.loadVideoById(id) } catch { /* */ }
  }, [])

  return {
    ready,
    state,
    duration,
    currentTime,
    play,
    pause,
    seekTo,
    getCurrentTime,
    getState,
    loadVideo,
  }
}
