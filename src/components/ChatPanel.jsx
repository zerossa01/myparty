import { useEffect, useRef, useState } from 'react'
import { useChat } from '../hooks/useChat.js'

// Stable color per user id.
const NAME_COLORS = [
  'text-fuchsia-300',
  'text-cyan-300',
  'text-amber-300',
  'text-emerald-300',
  'text-rose-300',
  'text-violet-300',
  'text-sky-300',
  'text-lime-300',
]
function colorFor(id) {
  if (!id) return NAME_COLORS[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function ChatPanel({ roomId, user, onClose }) {
  const { messages, sendMessage, loading } = useChat(roomId, user)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function handleSend(e) {
    e?.preventDefault?.()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await sendMessage(text)
      setDraft('')
    } catch {
      /* surface as inline could be added */
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 lg:w-[280px]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
            Chat
          </h3>
          <p className="text-xs text-zinc-500">Say hi to the room</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {loading && (
          <div className="text-center text-xs text-zinc-500">Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-xs text-zinc-500">
            No messages yet.
          </div>
        )}
        {messages.map((m) => {
          const mine = user && m.user_id === user.id
          return (
            <div
              key={m.id}
              className={'flex ' + (mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm ' +
                  (mine
                    ? 'bg-fuchsia-500/20 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-100')
                }
              >
                <div
                  className={
                    'flex items-center gap-1.5 text-xs ' +
                    (mine ? 'flex-row-reverse' : '')
                  }
                >
                  <span className="text-base leading-none">{m.avatar}</span>
                  <span className={'font-semibold ' + colorFor(m.user_id)}>
                    {mine ? 'You' : m.displayName}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {formatTime(m.created_at)}
                  </span>
                </div>
                <div className="mt-1 break-words whitespace-pre-wrap">
                  {m.text}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-zinc-800 p-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={500}
          placeholder="Message…"
          className="min-h-[44px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-fuchsia-400"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="min-h-[44px] rounded-lg bg-fuchsia-500 px-4 text-sm font-semibold hover:bg-fuchsia-400 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  )
}
