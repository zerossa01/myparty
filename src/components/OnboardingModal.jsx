import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'

const AVATARS = ['😎', '🌸', '⚡', '🎵', '🦊', '🐼', '👾', '🌙']

export default function OnboardingModal({ onDone }) {
  const { displayName: initialName, avatar: initialAvatar, signIn } = useAuth()
  const [name, setName] = useState(initialName || '')
  const [avatar, setAvatar] = useState(initialAvatar || AVATARS[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Please enter a display name.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(name, avatar)
      onDone?.()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:rounded-2xl"
      >
        <h2 className="text-2xl font-bold">Pick a name and avatar</h2>
        <p className="mt-1 text-sm text-zinc-400">
          You'll show up to other guests as this in chat and the room.
        </p>

        <label className="mt-6 block text-sm font-medium text-zinc-300">
          Display name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="e.g. moon-lover-22"
          className="mt-2 w-full min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-fuchsia-400"
          autoFocus
        />

        <div className="mt-6 text-sm font-medium text-zinc-300">Avatar</div>
        <div className="mt-2 grid grid-cols-8 gap-2">
          {AVATARS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setAvatar(emoji)}
              className={
                'flex h-11 w-11 items-center justify-center rounded-lg border text-xl transition ' +
                (avatar === emoji
                  ? 'border-fuchsia-400 bg-fuchsia-500/10'
                  : 'border-zinc-700 hover:border-zinc-500')
              }
              aria-label={`Choose ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-xl bg-fuchsia-500 px-4 py-2.5 font-semibold text-white shadow-lg shadow-fuchsia-500/30 hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {submitting ? 'Joining…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
