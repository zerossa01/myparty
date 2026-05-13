import { useState } from 'react'

/**
 * VoiceBar — compact voice-chat toggle for the top bar.
 *
 * Shows three states:
 *   - Not joined:  "🎤 Join voice"
 *   - Joined:      mic / mute toggle + "Leave"
 *   - Error:       inline message after a denied permission
 */
export default function VoiceBar({
  joined,
  muted,
  peerCount,
  onJoin,
  onLeave,
  onToggleMute,
}) {
  const [err, setErr] = useState(null)

  async function handleJoin() {
    setErr(null)
    try {
      await onJoin?.()
    } catch (e) {
      setErr(e?.message || 'Mic permission denied')
    }
  }

  if (!joined) {
    return (
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleJoin}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 hover:border-emerald-500/60 hover:text-emerald-300"
          title={err || 'Join voice chat'}
        >
          <span>🎤</span>
          <span className="hidden sm:inline">Voice</span>
        </button>
        {err && (
          <span className="ml-2 hidden text-[10px] text-red-400 sm:inline">
            {err}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5">
      <button
        type="button"
        onClick={onToggleMute}
        className={
          'flex h-7 w-7 items-center justify-center rounded-full text-sm transition ' +
          (muted ? 'bg-red-500/30 text-red-200' : 'bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40')
        }
        title={muted ? 'Unmute mic' : 'Mute mic'}
      >
        {muted ? '🔇' : '🎤'}
      </button>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
        {peerCount > 0 ? `${peerCount + 1} live` : 'live'}
      </span>
      <button
        type="button"
        onClick={onLeave}
        className="ml-1 flex h-7 items-center rounded-full bg-zinc-900/60 px-2 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-800"
        title="Leave voice"
      >
        Leave
      </button>
    </div>
  )
}
