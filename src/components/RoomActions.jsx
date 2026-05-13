import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { createRoom, joinRoomByCode } from '../lib/rooms.js'

export default function RoomActions() {
  const { user, displayName, avatar } = useAuth()
  const navigate = useNavigate()

  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [createErr, setCreateErr] = useState(null)
  const [joinErr, setJoinErr] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setCreateErr(null)
    if (!user) {
      setCreateErr('Sign in first.')
      return
    }
    setCreating(true)
    try {
      const room = await createRoom({
        name: roomName,
        user,
        displayName,
        avatar,
      })
      navigate(`/room/${room.id}`)
    } catch (err) {
      setCreateErr(err.message || 'Could not create room.')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    setJoinErr(null)
    if (!user) {
      setJoinErr('Sign in first.')
      return
    }
    setJoining(true)
    try {
      const room = await joinRoomByCode({
        code: joinCode,
        user,
        displayName,
        avatar,
      })
      navigate(`/room/${room.id}`)
    } catch (err) {
      setJoinErr(err.message || 'Could not join.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2">
      {/* Create */}
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
      >
        <h3 className="text-lg font-semibold">Create a room</h3>
        <p className="mt-1 text-sm text-zinc-400">
          You'll be the host and control playback.
        </p>
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          maxLength={40}
          placeholder="Room name (e.g. Friday Movie Night)"
          className="mt-4 w-full min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-fuchsia-400"
        />
        {createErr && (
          <div className="mt-2 text-sm text-red-400">{createErr}</div>
        )}
        <button
          type="submit"
          disabled={creating}
          className="mt-4 w-full rounded-xl bg-fuchsia-500 px-4 py-2.5 font-semibold text-white shadow-lg shadow-fuchsia-500/30 hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create room'}
        </button>
      </form>

      {/* Join */}
      <form
        onSubmit={handleJoin}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
      >
        <h3 className="text-lg font-semibold">Join with code</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Got a code from a friend? Drop it in.
        </p>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={12}
          placeholder="RAVE-4F2K"
          className="mt-4 w-full min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono tracking-wider text-zinc-100 outline-none focus:border-cyan-400"
        />
        {joinErr && <div className="mt-2 text-sm text-red-400">{joinErr}</div>}
        <button
          type="submit"
          disabled={joining}
          className="mt-4 w-full rounded-xl border border-zinc-700 px-4 py-2.5 font-semibold hover:bg-zinc-800 disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Join room'}
        </button>
      </form>
    </div>
  )
}
