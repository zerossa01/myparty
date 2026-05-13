import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * useSyncPlayer
 *
 * Hosts call broadcast(type, time) on play/pause/seek.
 * Guests receive events and mirror them on the YT player.
 *
 * Returns { broadcast, lastSyncAt } where lastSyncAt is updated on
 * every event RECEIVED so the UI can flash a "SYNCED" badge.
 *
 * @param {string|null} roomId
 * @param {boolean} isHost
 * @param {{play:Function, pause:Function, seekTo:Function, setVideoId?:Function}} controls
 */
export function useSyncPlayer(roomId, isHost, controls) {
  const channelRef = useRef(null)
  const controlsRef = useRef(controls)
  const [lastSyncAt, setLastSyncAt] = useState(0)

  // Keep ref fresh without re-subscribing the channel
  useEffect(() => {
    controlsRef.current = controls
  }, [controls])

  useEffect(() => {
    if (!roomId) return

    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false } },
    })

    channel.on('broadcast', { event: 'sync' }, ({ payload }) => {
      if (!payload || isHost) return // host doesn't mirror itself
      const { type, time, mediaUrl, cues, subName } = payload
      const c = controlsRef.current
      if (!c) return
      try {
        if (type === 'play') {
          c.seekTo(time, true)
          c.play()
        } else if (type === 'pause') {
          c.seekTo(time, true)
          c.pause()
        } else if (type === 'seek') {
          c.seekTo(time, true)
        } else if (type === 'video' && mediaUrl) {
          c.setMediaUrl?.(mediaUrl)
        } else if (type === 'subtitles') {
          c.setCues?.(Array.isArray(cues) ? cues : null, subName || '')
        }
      } catch (err) {
        console.warn('[useSyncPlayer] mirror failed', err)
      }
      setLastSyncAt(Date.now())
    })

    // When a guest first subscribes, ask the host (if any) to send the
    // current media URL so we don't sit on "Waiting…" forever. Also send
    // subtitles if any are loaded.
    channel.on('broadcast', { event: 'whoami' }, () => {
      if (!isHost) return
      const c = controlsRef.current
      const url = c?.getMediaUrl?.()
      if (url) {
        channel.send({
          type: 'broadcast',
          event: 'sync',
          payload: { type: 'video', time: 0, mediaUrl: url },
        })
      }
      const cues = c?.getCues?.()
      const subName = c?.getSubName?.() || ''
      if (Array.isArray(cues) && cues.length) {
        channel.send({
          type: 'broadcast',
          event: 'sync',
          payload: { type: 'subtitles', time: 0, cues, subName },
        })
      }
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && !isHost) {
        // Ping the host for the current video.
        channel.send({ type: 'broadcast', event: 'whoami', payload: {} })
      }
    })
    channelRef.current = channel

    return () => {
      try { supabase.removeChannel(channel) } catch { /* */ }
      channelRef.current = null
    }
  }, [roomId, isHost])

  const broadcast = useCallback((type, time, extra = {}) => {
    const channel = channelRef.current
    if (!channel) return
    channel.send({
      type: 'broadcast',
      event: 'sync',
      payload: { type, time: Number(time) || 0, ...extra },
    })
  }, [])

  return { broadcast, lastSyncAt }
}
