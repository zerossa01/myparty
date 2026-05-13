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
    if (!ready) return
    let cancelled = false
    setWorking(true)
    setError(null)

    // 10-second timeout so the page can't hang forever on a stuck network
    // request. If we still haven't resolved by then, show a clear error.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(
        'Timed out reaching the server. Check your connection and try again.'
      )), 10_000)
    )

    Promise.race([
      joinRoomByCode({ code: roomCode, user, displayName, avatar }),
      timeoutPromise,
    ])
      .then((room) => {
        if (!cancelled) navigate(`/room/${room.id}`, { replace: true })
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[JoinPage]', err)
          setError(err.message || 'Could not join.')
        }
      })
      .finally(() => {
        if (!cancelled) setWorking(false)
      })

    return () => { cancelled = true }
  // We deliberately only re-run when the auth becomes ready or the code
  // changes — not when `working` flips, which would cause a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, roomCode])

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
