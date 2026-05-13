import { useEffect, useState } from 'react'

/**
 * PresenceToasts
 * Listens to a `lastEvent` prop ({ kind, user }) and shows a stack of
 * 3-second auto-dismissing toasts at the bottom of the screen.
 */
export default function PresenceToasts({ lastEvent }) {
  const [toasts, setToasts] = useState([]) // [{ id, text }]

  useEffect(() => {
    if (!lastEvent?.user) return
    const { kind, user } = lastEvent
    const text =
      kind === 'join'
        ? `${user.avatar} ${user.displayName} joined the room`
        : `${user.avatar} ${user.displayName} left`
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, text }])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
    return () => clearTimeout(timer)
  }, [lastEvent])

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-full bg-zinc-900/90 px-4 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-zinc-700 backdrop-blur"
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
