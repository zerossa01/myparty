import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const LS_NAME = 'rave.displayName'
const LS_AVATAR = 'rave.avatar'

/**
 * useAuth
 * - Restores guest session from Supabase (persisted) on load.
 * - Reads display_name / avatar from localStorage.
 * - Exposes signIn(displayName, avatar) which:
 *     1. saves profile to localStorage
 *     2. signs the user in anonymously (if not already signed in)
 *
 * Returns: { user, displayName, avatar, loading, signIn, signOut }
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(LS_NAME) || ''
  )
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem(LS_AVATAR) || ''
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (name, emoji) => {
    const trimmed = (name || '').trim()
    if (!trimmed || !emoji) {
      throw new Error('Display name and avatar are required.')
    }

    localStorage.setItem(LS_NAME, trimmed)
    localStorage.setItem(LS_AVATAR, emoji)
    setDisplayName(trimmed)
    setAvatar(emoji)

    const { data: existing } = await supabase.auth.getSession()
    if (existing.session?.user) {
      setUser(existing.session.user)
      return existing.session.user
    }

    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    setUser(data.user)
    return data.user
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(LS_NAME)
    localStorage.removeItem(LS_AVATAR)
    setDisplayName('')
    setAvatar('')
    setUser(null)
  }, [])

  return { user, displayName, avatar, loading, signIn, signOut }
}
