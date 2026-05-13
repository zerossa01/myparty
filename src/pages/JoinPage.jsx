import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { joinRoomByCode } from '../lib/rooms.js'
import OnboardingModal from '../components/OnboardingModal.jsx'

/**
 * /join/:roomCode
 * - If the user already has a name + anon session, look up the room and
 *   redirect to /room/:id.
 * - Otherwise show the onboarding modal first, then continue.
 */
export default function JoinPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, displayName, avatar, loading } = useAuth()

  const [error, setError] = useState(null)
  const [working, setWorking] = useState(false)

  const ready = !loading && user && displayName && avatar

  useEffect(() => {
    if (!ready || working) return
    let cancelled = false
    setWorking(true)
    ;(async () => {
      try {
        const room = await joinRoomByCode({
          code: roomCode,
          user,
          displayName,
          avatar,
        })
        if (!cancelled) navigate(`/room/${room.id}`, { replace: true })
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not join.')
      } finally {
        if (!cancelled) setWorking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, roomCode, user, displayName, avatar, navigate, working])

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6">
      {!ready && !loading && <OnboardingModal />}

      <div className="text-center">
        <div className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Joining room
        </div>
        <div className="mt-2 font-mono text-2xl font-bold tracking-wider text-zinc-100">
          {roomCode}
        </div>

        {error ? (
          <div className="mt-6">
            <div className="text-red-400">{error}</div>
            <Link
              to="/"
              className="mt-4 inline-block rounded-xl bg-fuchsia-500 px-6 py-3 font-semibold text-white hover:bg-fuchsia-400"
            >
              Back home
            </Link>
          </div>
        ) : (
          <div className="mt-6 text-zinc-400">
            {ready ? 'Connecting…' : 'Set your name to continue.'}
          </div>
        )}
      </div>
    </div>
  )
}
