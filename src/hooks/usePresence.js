import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * usePresence
 *
 * Tracks the current user in supabase.channel('presence:{roomId}') and
 * exposes a deduped list of viewers plus join/leave events.
 *
 * @param {string|null} roomId
 * @param {{ id:string, displayName:string, avatar:string } | null} user
 *
 * @returns {{ viewers: Array, lastEvent: { kind:'join'|'leave', user } | null }}
 */
export function usePresence(roomId, user) {
  const [viewers, setViewers] = useState([])
  const [lastEvent, setLastEvent] = useState(null)
  const knownRef = useRef(new Set()) // ids we've already seen, for join/leave detection

  useEffect(() => {
    if (!roomId || !user?.id) return

    const channel = supabase.channel(`presence:${roomId}`, {
      config: { presence: { key: user.id } },
    })

    function rebuildViewers() {
      const state = channel.presenceState()
      const map = new Map()
      for (const key of Object.keys(state)) {
        const metas = state[key]
        // First meta wins for display fields.
        const meta = metas?.[0] || {}
        map.set(key, {
          id: key,
          displayName: meta.displayName || 'Guest',
          avatar: meta.avatar || '👤',
        })
      }
      const list = Array.from(map.values())
      setViewers(list)
      return list
    }

    channel.on('presence', { event: 'sync' }, () => {
      const list = rebuildViewers()
      const currentIds = new Set(list.map((v) => v.id))
      // Detect joins (skip self on very first sync — we just announced ourselves).
      for (const v of list) {
        if (!knownRef.current.has(v.id) && v.id !== user.id) {
          setLastEvent({ kind: 'join', user: v })
        }
      }
      // Detect leaves
      for (const id of knownRef.current) {
        if (!currentIds.has(id)) {
          // We may not still have their meta — keep last known if possible.
          setLastEvent({
            kind: 'leave',
            user: { id, displayName: 'Someone', avatar: '👤' },
          })
        }
      }
      knownRef.current = currentIds
    })

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      const meta = leftPresences?.[0] || {}
      setLastEvent({
        kind: 'leave',
        user: {
          id: key,
          displayName: meta.displayName || 'Someone',
          avatar: meta.avatar || '👤',
        },
      })
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          displayName: user.displayName,
          avatar: user.avatar,
          joinedAt: Date.now(),
        })
      }
    })

    return () => {
      try { channel.untrack() } catch { /* */ }
      try { supabase.removeChannel(channel) } catch { /* */ }
      knownRef.current = new Set()
    }
  }, [roomId, user?.id, user?.displayName, user?.avatar])

  return { viewers, lastEvent }
}
