import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabase.js'
import VideoPlayer from '../components/VideoPlayer.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import ViewersBar from '../components/ViewersBar.jsx'
import VoiceBar from '../components/VoiceBar.jsx'
import VoteSkipButton from '../components/VoteSkipButton.jsx'
import PresenceToasts from '../components/PresenceToasts.jsx'
import InviteButton from '../components/InviteButton.jsx'
import ExpiryCountdown from '../components/ExpiryCountdown.jsx'
import { usePresence } from '../hooks/usePresence.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { useRoomControl } from '../hooks/useRoomControl.js'
import { useVoiceChat } from '../hooks/useVoiceChat.js'

export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, displayName, loading: authLoading } = useAuth()

  const [room, setRoom] = useState(null)
  const [hostName, setHostName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Manual refetch — usable as a hard fallback when realtime is delayed or
  // not configured for the rooms table. Exposed to RoomBody so a successful
  // moderation action can force every client to re-sync immediately.
  const refreshRoom = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()
    if (error) { console.warn('[room] refresh failed', error); return null }
    if (data) setRoom(data)
    return data
  }, [roomId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (!data) {
        navigate('/', { replace: true })
        return
      }
      setRoom(data)
      setLoading(false)
    }
    load()

    // Live-update the room row so host transfers, video clears, etc. are
    // reflected immediately for everyone.
    //   1. postgres_changes — fast, depends on the rooms table being in the
    //      supabase_realtime publication
    //   2. broadcast 'room:changed' — fired manually after every successful
    //      moderation action so it works even if (1) is misconfigured
    //   3. polling every 5s as the last-resort safety net
    const ch = supabase
      .channel(`room-row-${roomId}`, { config: { broadcast: { self: true } } })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        ({ new: row }) => { if (!cancelled && row) setRoom(row) }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => { if (!cancelled) navigate('/', { replace: true }) }
      )
      .on('broadcast', { event: 'room:changed' }, () => {
        if (!cancelled) refreshRoom()
      })
      .subscribe()

    const poll = setInterval(() => { if (!cancelled) refreshRoom() }, 5000)

    return () => {
      cancelled = true
      clearInterval(poll)
      try { supabase.removeChannel(ch) } catch { /* */ }
    }
  }, [roomId, navigate, refreshRoom])

  // Re-resolve host display_name whenever the host_id changes (host transfer)
  useEffect(() => {
    if (!room?.host_id) return
    let cancelled = false
    ;(async () => {
      const { data: hostRow } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', room.host_id)
        .eq('room_id', room.id)
        .maybeSingle()
      if (!cancelled) setHostName(hostRow?.display_name || 'Host')
    })()
    return () => { cancelled = true }
  }, [room?.host_id, room?.id])

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        Loading room…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Back home
        </Link>
        <div className="mt-4 text-red-400">Error: {error}</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-6 text-zinc-300">
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Back home
        </Link>
        <p className="mt-4">You need to set a name before joining a room.</p>
      </div>
    )
  }

  if (!room) return null

  // Expiry gate
  if (room.expires_at && new Date(room.expires_at).getTime() < Date.now()) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6">
        <div className="max-w-md text-center">
          <div className="text-6xl">⌛</div>
          <h1 className="mt-4 text-2xl font-bold">This room has expired</h1>
          <p className="mt-2 text-zinc-400">
            Rooms automatically close 24 hours after they're created. Spin
            up a fresh one to keep watching.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-xl bg-fuchsia-500 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/30 hover:bg-fuchsia-400"
          >
            Create a new room
          </Link>
        </div>
      </div>
    )
  }

  const isHost = user.id === room.host_id

  return (
    <RoomBody
      room={room}
      hostName={hostName}
      isHost={isHost}
      user={user}
      displayName={displayName}
      refreshRoom={refreshRoom}
    />
  )
}

function RoomBody({ room, hostName, isHost, user, displayName, refreshRoom }) {
  const presenceUser = useMemo(
    () => ({ id: user.id, displayName, avatar: localStorage.getItem('partygram.avatar') || localStorage.getItem('rave.avatar') || '👤' }),
    [user.id, displayName]
  )
  const { viewers, lastEvent } = usePresence(room.id, presenceUser)
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [kickedNotice, setKickedNotice] = useState(null)
  const [toast, setToast] = useState(null) // {kind: 'ok'|'err', msg: string}

  const showToast = useCallback((kind, msg) => {
    setToast({ kind, msg })
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 3000)
  }, [])

  const viewersById = useMemo(() => {
    const m = new Map()
    for (const v of viewers) m.set(v.id, v)
    return m
  }, [viewers])

  const isDesktop = useMediaQuery('(min-width: 1024px)') // tailwind lg
  const navigate = useNavigate()

  // Unread-message badge: count INSERTs into messages while the chat is
  // hidden (mobile drawer closed). Reset to 0 the moment chat is opened.
  // On desktop the chat panel is always visible, so we never increment.
  const chatVisible = isDesktop || chatOpen
  useEffect(() => {
    if (chatVisible) setUnread(0)
  }, [chatVisible])

  useEffect(() => {
    const ch = supabase
      .channel(`room-msg-badge-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        ({ new: row }) => {
          if (!row) return
          if (row.user_id === user.id) return // ignore own messages
          // Read latest visibility synchronously from the closure-captured ref
          // via a state updater (avoids stale closure issues).
          setUnread((n) => (chatVisibleRef.current ? 0 : n + 1))
        }
      )
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch { /* */ } }
  }, [room.id, user.id])

  // Keep a ref of chatVisible so the realtime callback always reads the
  // latest value without re-subscribing on every toggle.
  const chatVisibleRef = useRef(chatVisible)
  useEffect(() => { chatVisibleRef.current = chatVisible }, [chatVisible])

  const presentIds = useMemo(() => viewers.map((v) => v.id), [viewers])

  // ── Voice chat (WebRTC mesh) ────────────────────────────────────────────
  const voice = useVoiceChat({ roomId: room.id, user, isHost })

  // ── Host moderation (kick / transfer / vote-skip) ──────────────────────
  const onKickedSelf = useCallback(() => {
    setKickedNotice('You were removed from the room by the host.')
    // Stop voice + leave after a short delay so the toast is visible.
    try { voice.leaveVoice?.() } catch { /* */ }
    setTimeout(() => navigate('/', { replace: true }), 2000)
  }, [navigate, voice])

  const onClearMedia = useCallback(async () => {
    if (!isHost) return
    // Persisting null video_url triggers the realtime UPDATE → all clients
    // (including the host) re-render VideoPlayer with an empty URL.
    const { error } = await supabase
      .from('rooms')
      .update({ video_url: '' })
      .eq('id', room.id)
    if (error) console.warn('[room] clear video failed', error)
  }, [isHost, room.id])

  const control = useRoomControl({
    roomId: room.id,
    user,
    isHost,
    presentIds,
    mediaUrl: room.video_url || '',
    onKickedSelf,
    onClearMedia,
  })

  // Moderation action handlers — defined after `control`/`voice` exist so
  // they can close over the latest action callbacks and surface a toast.
  const handleTransferHost = useCallback(async (uid) => {
    const name = viewersById.get(uid)?.displayName || 'that user'
    try {
      await control.transferHost(uid)
      // Force-refresh our own copy of the room row in case realtime is slow
      // or not configured for the rooms table. Other clients catch up via
      // the 5s polling safety net inside RoomPage.
      await refreshRoom()
      showToast('ok', `👑 ${name} is now the host`)
    } catch (e) {
      showToast('err', e?.message || 'Could not transfer host')
    }
  }, [control, viewersById, showToast, refreshRoom])

  const handleKick = useCallback(async (uid) => {
    const name = viewersById.get(uid)?.displayName || 'that user'
    try {
      await control.kick(uid)
      showToast('ok', `🚪 Kicked ${name}`)
    } catch (e) {
      showToast('err', e?.message || 'Could not kick user')
    }
  }, [control, viewersById, showToast])

  const handleForceMute = useCallback((uid) => {
    voice.forceMutePeer?.(uid)
    const name = viewersById.get(uid)?.displayName || 'that user'
    showToast('ok', `🔇 Asked ${name} to mute`)
  }, [voice, viewersById, showToast])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-black">
      {/* TOP BAR — slim, dark, theatrical. Single row, no wrap. */}
      <header className="relative z-50 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-950/90 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0" title="Home">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-cyan-500 text-sm font-extrabold text-white">P</span>
            <span className="hidden bg-gradient-to-r from-fuchsia-300 to-cyan-300 bg-clip-text font-bold tracking-tight text-transparent sm:inline">
              Partygram
            </span>
          </Link>
          <div className="hidden h-5 w-px bg-zinc-800 sm:block" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-xs font-bold text-zinc-200 sm:text-sm" title={`Room ${room.code}`}>
              {room.code}
            </span>
            {isHost && (
              <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-300">
                HOST
              </span>
            )}
            <span className="hidden text-zinc-600 md:inline" aria-hidden>·</span>
            <span className="hidden truncate text-[11px] text-zinc-500 md:inline">
              hosted by <span className="text-zinc-300">{hostName}</span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <VoteSkipButton
            myVote={control.myVote}
            voteCount={control.voteCount}
            voteNeeded={control.voteNeeded}
            disabled={!room.video_url}
            onVote={control.voteSkip}
          />
          <VoiceBar
            joined={voice.joined}
            muted={voice.muted}
            peerCount={voice.peers.size}
            onJoin={voice.joinVoice}
            onLeave={voice.leaveVoice}
            onToggleMute={voice.toggleMute}
          />
          <ViewersBar
            viewers={viewers}
            hostId={room.host_id}
            currentUserId={user.id}
            isHost={isHost}
            voicePeers={voice.peers}
            amInVoice={voice.joined}
            amMuted={voice.muted}
            onTransferHost={handleTransferHost}
            onKick={handleKick}
            onForceMute={handleForceMute}
            compact
          />
          <div className="hidden xl:block">
            <ExpiryCountdown expiresAt={room.expires_at} />
          </div>
          <InviteButton code={room.code} />
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 sm:w-auto sm:px-3"
            title="Leave room"
            aria-label="Leave room"
          >
            <span className="sm:hidden text-base leading-none">×</span>
            <span className="hidden text-xs font-semibold sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Kicked toast */}
      {kickedNotice && (
        <div className="fixed inset-x-0 top-4 z-[80] mx-auto w-fit rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 shadow-lg backdrop-blur">
          🚪 {kickedNotice}
        </div>
      )}

      {/* Generic action toast (success / error) */}
      {toast && (
        <div
          className={
            'fixed inset-x-0 top-16 z-[80] mx-auto w-fit rounded-xl border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur ' +
            (toast.kind === 'err'
              ? 'border-red-500/40 bg-red-500/15 text-red-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200')
          }
        >
          {toast.msg}
        </div>
      )}

      {/* MAIN — video left, chat right. Full-bleed, no scrolling, dark cinema feel. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
          <div className="flex min-h-0 flex-1 items-stretch">
            <VideoPlayer room={room} isHost={isHost} />
          </div>
        </main>

        {/* Desktop chat (full height) */}
        {isDesktop && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
            <ChatPanel roomId={room.id} user={user} />
          </aside>
        )}
      </div>

      {/* Mobile chat FAB (hidden on desktop) */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label={unread > 0 ? `Open chat (${unread} new)` : 'Open chat'}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-fuchsia-500 text-2xl shadow-lg shadow-fuchsia-500/40 hover:bg-fuchsia-400 lg:hidden"
      >
        💬
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-zinc-950 bg-red-500 px-1 text-[11px] font-bold leading-none text-white shadow-lg">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Mobile drawer backdrop */}
      <div
        onClick={() => setChatOpen(false)}
        className={
          'fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ' +
          (chatOpen ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />
      {/* Mobile drawer: ChatPanel only mounts here when open, so we never
          mount two ChatPanel instances at once (would clash on the same
          Supabase channel name). */}
      <div
        className={
          'fixed inset-x-0 bottom-0 z-40 h-[60vh] transform overflow-hidden rounded-t-2xl border-t border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 lg:hidden ' +
          (chatOpen ? 'translate-y-0' : 'translate-y-full')
        }
      >
        {!isDesktop && chatOpen && (
          <ChatPanel
            roomId={room.id}
            user={user}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>

      <PresenceToasts lastEvent={lastEvent} />
    </div>
  )
}
