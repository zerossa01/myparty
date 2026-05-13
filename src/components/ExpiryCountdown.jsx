import { useEffect, useState } from 'react'

function format(remainingMs) {
  if (remainingMs <= 0) return 'expired'
  const totalSec = Math.floor(remainingMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h >= 1) return `Expires in ${h}h ${m}m`
  if (m >= 1) return `Expires in ${m}m`
  return `Expires in <1m`
}

export default function ExpiryCountdown({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [expiresAt])

  if (!expiresAt) return null
  const target = new Date(expiresAt).getTime()
  const remaining = target - now
  if (Number.isNaN(target)) return null

  const urgent = remaining > 0 && remaining < 60 * 60 * 1000 // < 1h
  return (
    <span
      className={
        'rounded-full px-2 py-0.5 text-xs font-semibold ' +
        (urgent
          ? 'bg-amber-500/20 text-amber-300'
          : 'bg-zinc-800 text-zinc-400')
      }
      title={new Date(expiresAt).toLocaleString()}
    >
      {format(remaining)}
    </span>
  )
}
