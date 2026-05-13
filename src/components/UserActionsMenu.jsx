import { useEffect, useRef } from 'react'

/**
 * UserActionsMenu — small popover the host can open from a viewer chip
 * to moderate that viewer (transfer host, kick, force-mute mic).
 *
 * Props:
 *   user:           { id, displayName, avatar }
 *   isVoiceJoined:  is target currently in voice chat?
 *   onTransferHost: () => void
 *   onKick:         () => void
 *   onForceMute:    () => void  — only meaningful if target is in voice
 *   onClose:        () => void
 */
export default function UserActionsMenu({
  user,
  isVoiceJoined,
  onTransferHost,
  onKick,
  onForceMute,
  onClose,
}) {
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return
      if (!ref.current.contains(e.target)) onClose?.()
    }
    function onEsc(e) { if (e.key === 'Escape') onClose?.() }
    // Defer attachment so the click that opened us doesn't immediately close.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('keydown', onEsc)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-[70] mt-2 w-48 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      role="menu"
    >
      <div className="border-b border-zinc-800 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">{user.avatar || '👤'}</span>
          <span className="truncate font-semibold text-zinc-200">
            {user.displayName || 'Guest'}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { onTransferHost?.(); onClose?.() }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-amber-300 hover:bg-amber-500/10"
      >
        <span>👑</span> Make leader
      </button>

      <button
        type="button"
        onClick={() => { onForceMute?.(); onClose?.() }}
        disabled={!isVoiceJoined}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        title={isVoiceJoined ? 'Force-mute their mic' : 'User is not in voice'}
      >
        <span>🔇</span> Mute mic
      </button>

      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Kick ${user.displayName || 'this user'} from the room?`)) {
            onKick?.()
            onClose?.()
          }
        }}
        className="flex w-full items-center gap-2 border-t border-zinc-800 px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-red-500/10"
      >
        <span>🚪</span> Kick from room
      </button>
    </div>
  )
}
