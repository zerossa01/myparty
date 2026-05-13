import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabase.js'
import VideoPlayer from '../components/VideoPlayer.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import ViewersBar from '../components/ViewersBar.jsx'
import PresenceToasts from '../components/PresenceToasts.jsx'
import InviteButton from '../components/InviteButton.jsx'
import ExpiryCountdown from '../components/ExpiryCountdown.jsx'
import { usePresence } from '../hooks/usePresence.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'

export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, displayName, loading: authLoading } = useAuth()

  const [room, setRoom] = useState(null)
  const [hostName, setHostName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

      // Look up host's display_name from the users table.
      const { data: hostRow } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', data.host_id)
        .eq('room_id', data.id)
        .maybeSingle()
      if (!cancelled) setHostName(hostRow?.display_name || 'Host')
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [roomId, navigate])

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
    />
  )
}

function RoomBody({ room, hostName, isHost, user, displayName }) {
  const presenceUser = useMemo(
    () => ({ id: user.id, displayName, avatar: localStorage.getItem('partygram.avatar') || localStorage.getItem('rave.avatar') || '👤' }),
    [user.id, displayName]
  )
  const { viewers, lastEvent } = usePresence(room.id, presenceUser)
  const [chatOpen, setChatOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)') // tailwind lg
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-black">
      {/* TOP BAR — slim, dark, theatrical */}
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-950/80 px-3 py-2 backdrop-blur sm:px-5 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-cyan-500 text-sm font-extrabold text-white">P</span>
            <span className="hidden bg-gradient-to-r from-fuchsia-300 to-cyan-300 bg-clip-text font-bold tracking-tight text-transparent sm:inline">
              Partygram
            </span>
          </Link>
          <div className="hidden h-5 w-px bg-zinc-800 sm:block" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Room</span>
            <span className="truncate font-mono text-xs font-bold text-zinc-100 sm:text-sm">
              {room.code}
            </span>
            {isHost && (
              <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                HOST
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ViewersBar viewers={viewers} hostId={room.host_id} compact />
          <ExpiryCountdown expiresAt={room.expires_at} />
          <InviteButton code={room.code} />
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex h-8 items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
            title="Leave room"
          >
            Leave
          </button>
        </div>
      </header>

      {/* MAIN — video left, chat right. Full-bleed, no scrolling, dark cinema feel. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
          {/* Room title strip — subtle, above the player */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-900 px-3 py-1.5 text-xs text-zinc-500">
            <div className="truncate">
              <span className="font-semibold text-zinc-300">{room.name}</span>
              <span className="ml-2 text-zinc-600">·</span>
              <span className="ml-2">hosted by <span className="text-zinc-400">{hostName}</span></span>
            </div>
            <div className="shrink-0 text-zinc-600">
              joined as <span className="text-zinc-400">{displayName}</span>
            </div>
          </div>
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
        aria-label="Open chat"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-fuchsia-500 text-2xl shadow-lg shadow-fuchsia-500/40 hover:bg-fuchsia-400 lg:hidden"
      >
        💬
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
