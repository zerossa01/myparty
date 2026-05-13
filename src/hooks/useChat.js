import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * useChat
 * - Fetches the last 50 messages on mount.
 * - Fetches all room users once and keeps a local map of id -> { name, avatar }.
 * - Subscribes to INSERTs on `messages` filtered by room_id.
 * - sendMessage(text) inserts a row.
 * - Cleans up the channel on unmount.
 *
 * @returns { messages, sendMessage, loading, userMap }
 *   messages: [{ id, room_id, user_id, text, created_at, displayName, avatar }]
 */
export function useChat(roomId, user) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const userMapRef = useRef(new Map()) // id -> { displayName, avatar }
  const [, forceTick] = useState(0)

  const decorate = useCallback((row) => {
    const u = userMapRef.current.get(row.user_id)
    return {
      ...row,
      displayName: u?.displayName || 'Guest',
      avatar: u?.avatar || '👤',
    }
  }, [])

  // Fetch a single user and cache them. Returns the cached entry.
  const ensureUser = useCallback(async (userId) => {
    if (!userId || userMapRef.current.has(userId)) return
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, avatar_emoji')
      .eq('id', userId)
      .eq('room_id', roomId)
      .maybeSingle()
    if (error || !data) return
    userMapRef.current.set(data.id, {
      displayName: data.display_name,
      avatar: data.avatar_emoji,
    })
    forceTick((n) => n + 1)
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    async function init() {
      setLoading(true)

      // 1. Fetch all participants up-front for the local lookup.
      const { data: usersData } = await supabase
        .from('users')
        .select('id, display_name, avatar_emoji')
        .eq('room_id', roomId)
      if (!cancelled && usersData) {
        const m = new Map()
        for (const u of usersData) {
          m.set(u.id, {
            displayName: u.display_name,
            avatar: u.avatar_emoji,
          })
        }
        userMapRef.current = m
      }

      // 2. Last 50 messages, oldest first.
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, room_id, user_id, text, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      const ordered = (msgs || []).slice().reverse()
      setMessages(ordered.map(decorate))
      setLoading(false)
    }
    init()

    // 3. Realtime subscription for new messages in this room.
    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const row = payload.new
          if (!userMapRef.current.has(row.user_id)) {
            await ensureUser(row.user_id)
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, decorate(row)]
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      try { supabase.removeChannel(channel) } catch { /* */ }
    }
  }, [roomId, decorate, ensureUser])

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text || '').trim()
      if (!trimmed || !user || !roomId) return
      const { error } = await supabase.from('messages').insert({
        room_id: roomId,
        user_id: user.id,
        text: trimmed,
      })
      if (error) {
        console.warn('[useChat] sendMessage failed', error)
        throw error
      }
    },
    [roomId, user]
  )

  return { messages, sendMessage, loading }
}
