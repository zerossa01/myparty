import { useState, useRef, useEffect } from 'react'
import UserActionsMenu from './UserActionsMenu.jsx'

/**
 * ViewersBar — compact pill in the top bar that opens a dropdown listing
 * everyone in the room. The current host can click any other viewer to open
 * a moderation menu (transfer host, force-mute mic, kick).
 *
 * Props:
 *   viewers:        [{ id, displayName, avatar }]
 *   hostId:         current host's user id
 *   currentUserId:  the local user's id
 *   isHost:         is the local user the host?
 *   voicePeers:     Map<userId, { speaking, muted }>  (optional)
 *   amInVoice:      bool  — is local user in voice?  (optional)
 *   amMuted:        bool  — is local user mic muted?  (optional)
 *   onTransferHost: (userId) => void
 *   onKick:         (userId) => void
 *   onForceMute:    (userId) => void
 */
export default function ViewersBar({
  viewers,
  hostId,
  currentUserId,
  isHost = false,
  voicePeers,
  amInVoice = false,
  amMuted = false,
  onTransferHost,
  onKick,
  onForceMute,
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const [menuFor, setMenuFor] = useState(null) // userId of open submenu
  const ref = useRef(null)

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (!ref.current) return
      if (!ref.current.contains(e.target)) {
        setOpen(false); setMenuFor(null)
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  if (!compact) {
    // Legacy non-compact mode — kept for any callers still using it.
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Watching</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {viewers.map((v) => (
            <span key={v.id} title={v.displayName} className="text-lg">{v.avatar}</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
        title="Show participants"
      >
        <span>👥</span>
        <span>{viewers.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Participants · {viewers.length}
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {viewers.map((v) => {
              const vIsHost = v.id === hostId
              const vIsMe = v.id === currentUserId
              const peer = voicePeers?.get(v.id)
              // Local user voice info comes from amInVoice/amMuted, peers come from peer state.
              const inVoice = vIsMe ? amInVoice : !!peer
              const isMuted = vIsMe ? amMuted : !!peer?.muted
              const speaking = vIsMe ? false : !!peer?.speaking
              return (
                <li key={v.id} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      // Hosts can open the action menu on any *other* user.
                      if (isHost && !vIsMe) setMenuFor((cur) => (cur === v.id ? null : v.id))
                    }}
                    disabled={!isHost || vIsMe}
                    className={
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-xs ' +
                      (isHost && !vIsMe
                        ? 'hover:bg-zinc-800 cursor-pointer'
                        : 'cursor-default')
                    }
                  >
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-base">
                      {v.avatar || '👤'}
                      {vIsHost && (
                        <span className="absolute -right-1 -top-1 text-xs leading-none">👑</span>
                      )}
                      {/* Speaking ring */}
                      {speaking && (
                        <span className="absolute inset-0 -m-0.5 animate-ping rounded-full ring-2 ring-emerald-400" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-zinc-100">
                        {v.displayName || 'Guest'}
                        {vIsMe && <span className="ml-1 text-zinc-500">(you)</span>}
                      </span>
                      <span className="block text-[10px] text-zinc-500">
                        {vIsHost ? 'Leader' : 'Viewer'}
                        {inVoice && (isMuted ? ' · 🔇 muted' : ' · 🎤 in voice')}
                      </span>
                    </span>
                    {isHost && !vIsMe && (
                      <span className="text-zinc-500">⋯</span>
                    )}
                  </button>

                  {menuFor === v.id && (
                    <UserActionsMenu
                      user={v}
                      isVoiceJoined={inVoice}
                      onTransferHost={() => onTransferHost?.(v.id)}
                      onKick={() => onKick?.(v.id)}
                      onForceMute={() => onForceMute?.(v.id)}
                      onClose={() => setMenuFor(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
