import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * useRoomControl
 *
 * Wires up host moderation controls and group-vote actions over the room's
 * Supabase Realtime channel. Three independent features ride on a single
 * channel to keep network traffic minimal:
 *
 *   - kick:         host removes a participant (target is told to leave)
 *   - transferHost: host hands the crown to another participant; the room
 *                   row's `host_id` is also updated so the change persists.
 *   - voteSkip:     anyone can vote to skip the currently loaded video.
 *                   When > 50% of present viewers have voted (and the host
 *                   sees that majority), the host clears the video URL.
 *
 * Returns the current state of all three features plus action callbacks.
 */
export function useRoomControl({
  roomId,
  user,
  isHost,
  presentIds,           // array of currently-present user ids (from presence)
  mediaUrl,             // current room media url (used as the vote-key)
  onKickedSelf,         // () => void — called when WE were kicked
  onClearMedia,         // () => void — host-only: called when vote majority reached
}) {
  // userIds who voted to skip the *current* mediaUrl. Resets when mediaUrl changes.
  const [skipVotes, setSkipVotes] = useState(() => new Set())
  const channelRef = useRef(null)

  // Reset votes whenever the video changes.
  useEffect(() => {
    setSkipVotes(new Set())
  }, [mediaUrl])

  // Single shared channel for the room's moderation events.
  useEffect(() => {
    if (!roomId || !user?.id) return
    const ch = supabase.channel(`room-control-${roomId}`, {
      config: { broadcast: { self: true } },
    })

    ch.on('broadcast', { event: 'kick' }, ({ payload }) => {
      if (payload?.target === user.id) {
        onKickedSelf?.()
      }
    })

    ch.on('broadcast', { event: 'voteSkip' }, ({ payload }) => {
      if (!payload?.from || !payload?.mediaUrl) return
      // Only count votes for the current video.
      if (payload.mediaUrl !== mediaUrl) return
      setSkipVotes((prev) => {
        if (prev.has(payload.from)) return prev
        const next = new Set(prev)
        next.add(payload.from)
        return next
      })
    })

    ch.subscribe()
    channelRef.current = ch
    return () => {
      try { supabase.removeChannel(ch) } catch { /* */ }
      channelRef.current = null
    }
  }, [roomId, user?.id, mediaUrl, onKickedSelf])

  // Host-side: when vote-skip reaches majority, clear the video.
  useEffect(() => {
    if (!isHost || !mediaUrl) return
    const present = new Set(presentIds || [])
    // Only count votes from people currently in the room.
    let count = 0
    for (const id of skipVotes) if (present.has(id)) count++
    const need = Math.floor(present.size / 2) + 1
    if (count >= need && need >= 1) {
      onClearMedia?.()
    }
  }, [skipVotes, presentIds, isHost, mediaUrl, onClearMedia])

  /* ---------- actions ---------- */

  const kick = useCallback((targetId) => {
    if (!isHost || !channelRef.current || !targetId) return
    return channelRef.current.send({
      type: 'broadcast',
      event: 'kick',
      payload: { target: targetId, from: user.id },
    })
  }, [isHost, user?.id])

  const transferHost = useCallback(async (newHostId) => {
    if (!isHost || !roomId || !newHostId || newHostId === user.id) return
    // Persist on the rooms row so a refresh reflects the new host.
    const { error } = await supabase
      .from('rooms')
      .update({ host_id: newHostId })
      .eq('id', roomId)
    if (error) {
      console.warn('[room-control] transferHost failed', error)
      throw error
    }
  }, [isHost, roomId, user?.id])

  const voteSkip = useCallback(() => {
    if (!channelRef.current || !mediaUrl) return
    return channelRef.current.send({
      type: 'broadcast',
      event: 'voteSkip',
      payload: { from: user.id, mediaUrl },
    })
  }, [user?.id, mediaUrl])

  // Have I already voted to skip this one?
  const myVote = !!user?.id && skipVotes.has(user.id)
  // Live counts based on currently-present viewers.
  const presentSet = new Set(presentIds || [])
  let voteCount = 0
  for (const id of skipVotes) if (presentSet.has(id)) voteCount++
  const voteNeeded = Math.max(1, Math.floor((presentIds?.length || 1) / 2) + 1)

  return {
    kick,
    transferHost,
    voteSkip,
    myVote,
    voteCount,
    voteNeeded,
  }
}
