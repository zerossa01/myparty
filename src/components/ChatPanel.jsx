import { useEffect, useMemo, useRef, useState } from 'react'
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

const REACTION_PALETTE = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🎉', '👏']

export default function ChatPanel({ roomId, user, onClose }) {
  const { messages, sendMessage, toggleReaction, loading } = useChat(roomId, user)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState(null)         // message object being replied to
  const [pickerFor, setPickerFor] = useState(null)     // message id whose reaction picker is open
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  // Long-press handling for touch devices — schedule the context menu
  // after 450ms; movement / lift cancels it.
  const longPressRef = useRef({ timer: null, msgId: null })

  // Build a quick lookup so reply quotes can render the original message text.
  const messagesById = useMemo(() => {
    const m = new Map()
    for (const x of messages) m.set(x.id, x)
    return m
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Close any open context menu when clicking anywhere outside a message bubble.
  useEffect(() => {
    if (!pickerFor) return
    function onDoc(e) {
      if (!(e.target instanceof Element)) return
      if (!e.target.closest('[data-msg-bubble]')) setPickerFor(null)
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [pickerFor])

  async function handleSend(e) {
    e?.preventDefault?.()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await sendMessage(text, replyTo?.id || null)
      setDraft('')
      setReplyTo(null)
    } catch {
      /* surface as inline could be added */
    } finally {
      setSending(false)
    }
  }

  function startReply(msg) {
    setReplyTo(msg)
    setPickerFor(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleReact(messageId, emoji) {
    toggleReaction(messageId, emoji)
    setPickerFor(null)
  }

  // ── Context-menu triggers ─────────────────────────────────────────────
  function openContextMenu(msg) {
    setPickerFor(msg.id)
    // Subtle haptic feedback on supported mobile devices.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15) } catch { /* */ }
    }
  }
  function onBubbleContextMenu(e, msg) {
    e.preventDefault()
    openContextMenu(msg)
  }
  function onTouchStart(msg) {
    cancelLongPress()
    longPressRef.current.msgId = msg.id
    longPressRef.current.timer = setTimeout(() => openContextMenu(msg), 450)
  }
  function cancelLongPress() {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer)
      longPressRef.current.timer = null
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const QUICK_REACTIONS = ['😀', '❤️', '🔥', '👏', '😂', '🎉', '😮', '😢']
  function quickSend(emoji) {
    setDraft((d) => (d ? d + emoji : emoji))
  }

  return (
    <aside className="flex h-full w-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <h3 className="text-sm font-bold tracking-wide text-zinc-100">Chat</h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {loading && (
          <div className="text-center text-xs text-zinc-500">Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-3xl opacity-30">💬</span>
            <span className="text-xs text-zinc-500">No messages yet.</span>
            <span className="text-[11px] text-zinc-600">Be the first to say something!</span>
          </div>
        )}
        {messages.map((m) => {
          const mine = user && m.user_id === user.id
          const replied = m.reply_to ? messagesById.get(m.reply_to) : null
          const reactions = m.reactions || {}
          const reactionEntries = Object.entries(reactions).filter(
            ([, list]) => Array.isArray(list) && list.length > 0
          )
          const isPickerOpen = pickerFor === m.id
          return (
            <div
              key={m.id}
              className={'group relative flex ' + (mine ? 'justify-end' : 'justify-start')}
            >
              <div
                data-msg-bubble
                className={
                  'relative max-w-[85%] cursor-default select-none rounded-2xl px-3 py-2 text-sm ' +
                  (mine
                    ? 'bg-fuchsia-500/20 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-100')
                }
                onContextMenu={(e) => onBubbleContextMenu(e, m)}
                onTouchStart={() => onTouchStart(m)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onTouchCancel={cancelLongPress}
              >
                {/* Reply quote */}
                {replied && (
                  <div className="mb-1 rounded-md border-l-2 border-fuchsia-400/60 bg-black/25 px-2 py-1 text-[11px] leading-tight">
                    <div className={'font-semibold ' + colorFor(replied.user_id)}>
                      ↪ {replied.user_id === user?.id ? 'You' : replied.displayName}
                    </div>
                    <div className="truncate text-zinc-400">{replied.text}</div>
                  </div>
                )}
                {m.reply_to && !replied && (
                  <div className="mb-1 rounded-md border-l-2 border-zinc-600 bg-black/25 px-2 py-1 text-[11px] italic text-zinc-500">
                    ↪ original message
                  </div>
                )}

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

                {/* Reaction chips */}
                {reactionEntries.length > 0 && (
                  <div className={'mt-1.5 flex flex-wrap gap-1 ' + (mine ? 'justify-end' : '')}>
                    {reactionEntries.map(([emoji, list]) => {
                      const reactedByMe = user && list.includes(user.id)
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReact(m.id, emoji)}
                          className={
                            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition ' +
                            (reactedByMe
                              ? 'border-fuchsia-400/60 bg-fuchsia-500/30 text-white'
                              : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500')
                          }
                          title={reactedByMe ? 'Remove your reaction' : 'React'}
                        >
                          <span>{emoji}</span>
                          <span className="font-semibold">{list.length}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Hover/active toolbar */}
                <div
                  className={
                    'absolute -top-3 z-10 flex items-center gap-0.5 rounded-full border border-zinc-700 bg-zinc-900/95 px-1 py-0.5 shadow-lg transition ' +
                    (mine ? 'left-1' : 'right-1') + ' ' +
                    (isPickerOpen
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')
                  }
                >
                  <button
                    type="button"
                    onClick={() => setPickerFor(isPickerOpen ? null : m.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-zinc-800"
                    title="Add reaction"
                  >
                    😊
                  </button>
                  <button
                    type="button"
                    onClick={() => startReply(m)}
                    className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
                    title="Reply"
                  >
                    ↪ Reply
                  </button>
                </div>

                {/* Context menu — opens on hover-😊, right-click, or long-press.
                    Contains the emoji palette plus a Reply shortcut. */}
                {isPickerOpen && (
                  <div
                    className={
                      'absolute -top-12 z-20 flex items-center gap-0.5 rounded-full border border-zinc-700 bg-zinc-900 px-1.5 py-1 shadow-xl ' +
                      (mine ? 'left-1' : 'right-1')
                    }
                  >
                    {REACTION_PALETTE.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => handleReact(m.id, e)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-base transition hover:scale-125 hover:bg-zinc-800"
                      >
                        {e}
                      </button>
                    ))}
                    <span className="mx-1 h-5 w-px bg-zinc-700" aria-hidden />
                    <button
                      type="button"
                      onClick={() => { startReply(m); setPickerFor(null) }}
                      className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-fuchsia-300 hover:bg-zinc-800"
                      title="Reply"
                    >
                      ↪ Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(m.text); setPickerFor(null) }}
                      className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
                      title="Copy text"
                    >
                      ⧉
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick emoji reactions */}
      <div className="flex items-center gap-1 border-t border-zinc-800 px-2 py-1.5">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => quickSend(e)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base transition hover:scale-125 hover:bg-zinc-800"
            title={`Insert ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[11px]">
          <span className="text-fuchsia-300">↪ Replying to</span>
          <span className={'font-semibold ' + colorFor(replyTo.user_id)}>
            {replyTo.user_id === user?.id ? 'yourself' : replyTo.displayName}
          </span>
          <span className="flex-1 truncate text-zinc-400">{replyTo.text}</span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
            className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-zinc-800 p-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={500}
          placeholder={replyTo ? 'Write a reply…' : 'Say something…'}
          className="min-h-[40px] flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-fuchsia-400"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30 transition hover:bg-fuchsia-400 disabled:opacity-40 disabled:shadow-none"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
      </form>
    </aside>
  )
}
