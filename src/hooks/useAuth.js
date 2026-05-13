import { useCallback, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase.js'

const LS_NAME = 'partygram.displayName'
const LS_AVATAR = 'partygram.avatar'

// Migrate any legacy keys from the pre-rename era.
function readLegacy(key, legacyKey) {
  const v = localStorage.getItem(key)
  if (v) return v
  const old = localStorage.getItem(legacyKey)
  if (old) {
    localStorage.setItem(key, old)
    localStorage.removeItem(legacyKey)
    return old
  }
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton store. Every `useAuth()` consumer subscribes to the
// same state, so signing in from the OnboardingModal instantly propagates to
// HomePage / RoomPage without needing a manual refresh.
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  user: null,
  displayName: readLegacy(LS_NAME, 'rave.displayName'),
  avatar: readLegacy(LS_AVATAR, 'rave.avatar'),
  loading: true,
}
const listeners = new Set()
let snapshot = { ...state }

function notify() {
  // Re-create the snapshot so React sees a new reference.
  snapshot = { ...state }
  for (const l of listeners) l()
}
function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot() { return snapshot }
const SERVER_SNAPSHOT = { user: null, displayName: '', avatar: '', loading: true }
function getServerSnapshot() { return SERVER_SNAPSHOT }

// Initialise the Supabase session once, lazily.
let bootstrapped = false
function bootstrap() {
  if (bootstrapped) return
  bootstrapped = true
  supabase.auth.getSession().then(({ data }) => {
    state.user = data.session?.user ?? null
    state.loading = false
    notify()
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user ?? null
    notify()
  })
}

/**
 * useAuth — shared across the whole app via a tiny module-level store.
 * Returns: { user, displayName, avatar, loading, signIn, signOut }
 */
export function useAuth() {
  bootstrap()
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const signIn = useCallback(async (name, emoji) => {
    const trimmed = (name || '').trim()
    if (!trimmed || !emoji) {
      throw new Error('Display name and avatar are required.')
    }

    localStorage.setItem(LS_NAME, trimmed)
    localStorage.setItem(LS_AVATAR, emoji)
    state.displayName = trimmed
    state.avatar = emoji
    notify()

    const { data: existing } = await supabase.auth.getSession()
    if (existing.session?.user) {
      state.user = existing.session.user
      notify()
      return existing.session.user
    }

    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    state.user = data.user
    notify()
    return data.user
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(LS_NAME)
    localStorage.removeItem(LS_AVATAR)
    state.displayName = ''
    state.avatar = ''
    state.user = null
    notify()
  }, [])

  return { ...snap, signIn, signOut }
}

// Exported helper if any other module wants to read the current snapshot
// synchronously (without subscribing).
export function getAuthSnapshot() { return snapshot }
