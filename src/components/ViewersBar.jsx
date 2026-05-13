export default function ViewersBar({ viewers, hostId, compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-300">
        <span>👥</span>
        <span>
          {viewers.length} watching
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
          Watching
        </h3>
        <span className="text-xs text-zinc-500">
          {viewers.length} watching
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {viewers.length === 0 && (
          <span className="text-xs text-zinc-500">Just you, for now.</span>
        )}
        {viewers.map((v) => {
          const isHost = v.id === hostId
          return (
            <div
              key={v.id}
              title={v.displayName + (isHost ? ' (host)' : '')}
              className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-lg"
            >
              <span>{v.avatar}</span>
              {isHost && (
                <span className="absolute -right-1 -top-1 text-xs">👑</span>
              )}
              {/* Hover tooltip */}
              <span className="pointer-events-none absolute -bottom-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-950 px-2 py-0.5 text-xs text-zinc-200 opacity-0 shadow ring-1 ring-zinc-800 transition group-hover:opacity-100">
                {v.displayName}
                {isHost && ' · host'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
