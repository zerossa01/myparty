import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import OnboardingModal from '../components/OnboardingModal.jsx'
import RoomActions from '../components/RoomActions.jsx'

const HOW_IT_WORKS = [
  {
    emoji: '🎬',
    title: 'Paste any YouTube link',
    desc: 'Drop a video URL — playback stays in perfect sync with everyone.',
  },
  {
    emoji: '🔗',
    title: 'Share your room code',
    desc: 'One-tap invite link. Friends jump straight in, no signup wall.',
  },
  {
    emoji: '👥',
    title: 'Watch in perfect sync',
    desc: 'Play, pause, and seek together with live chat on the side.',
  },
]

const FEATURES = [
  { emoji: '⚡', label: 'Instant sync' },
  { emoji: '💬', label: 'Live chat' },
  { emoji: '👾', label: 'No account needed' },
  { emoji: '📱', label: 'Works on mobile' },
]

export default function HomePage() {
  const { user, displayName, avatar, loading } = useAuth()
  const [editing, setEditing] = useState(false)

  const needsOnboarding = !loading && (!user || !displayName || !avatar)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100">
      {(needsOnboarding || editing) && (
        <OnboardingModal onDone={() => setEditing(false)} />
      )}

      {/* Top nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <a href="#hero" className="text-xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            RAVE
          </span>
        </a>
        {user && (
          <button
            onClick={() => setEditing(true)}
            className="flex min-h-[36px] items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
          >
            <span className="text-lg">{avatar}</span>
            <span>{displayName}</span>
          </button>
        )}
      </nav>

      {/* HERO */}
      <section
        id="hero"
        className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-6 sm:px-6 sm:pb-16 sm:pt-10 lg:grid-cols-2 lg:items-center lg:gap-12 lg:pt-16"
      >
        <div className="text-center lg:text-left">
          <h1 className="bg-gradient-to-br from-fuchsia-300 via-fuchsia-400 to-cyan-300 bg-clip-text text-5xl font-extrabold leading-[1.05] tracking-tight text-transparent sm:text-6xl lg:text-7xl">
            RAVE
          </h1>
          <p className="mt-4 text-2xl font-semibold text-zinc-200 sm:text-3xl">
            Watch together. Feel together.
          </p>
          <p className="mx-auto mt-3 max-w-md text-zinc-400 lg:mx-0">
            Synced YouTube watch parties with live chat and presence — no
            sign-up, no install, just a link.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
            <a
              href="#actions"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-fuchsia-500 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/30 hover:bg-fuchsia-400"
            >
              Create a Room
            </a>
            <a
              href="#actions"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-zinc-700 px-6 py-3 font-semibold hover:bg-zinc-800"
            >
              Join a Room
            </a>
          </div>
        </div>

        {/* Mockup */}
        <MockupPreview />
      </section>

      {/* ROOM ACTIONS (only when signed in) */}
      <section
        id="actions"
        className="mx-auto max-w-4xl scroll-mt-20 px-4 pb-12 sm:px-6"
      >
        {user ? (
          <RoomActions />
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
            <p className="text-zinc-300">
              Pick a name + avatar to create or join a room.
            </p>
            <button
              onClick={() => setEditing(true)}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-fuchsia-500 px-5 py-2.5 font-semibold hover:bg-fuchsia-400"
            >
              Get started
            </button>
          </div>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          How it works
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-zinc-400">
          Three steps. About thirty seconds.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700"
            >
              <div className="text-3xl">{s.emoji}</div>
              <div className="mt-3 text-xs font-mono text-zinc-500">
                STEP {i + 1}
              </div>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-center"
            >
              <div className="text-3xl">{f.emoji}</div>
              <div className="mt-2 text-sm font-semibold text-zinc-200">
                {f.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-900 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6">
          <div>Built with Supabase + React</div>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-300"
          >
            GitHub →
          </a>
        </div>
      </footer>
    </div>
  )
}

function MockupPreview() {
  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-none">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-3 shadow-2xl shadow-fuchsia-500/10">
        <div className="flex items-center gap-1.5 px-2 pb-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70"></span>
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70"></span>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70"></span>
          <span className="ml-3 text-xs text-zinc-500">RAVE-4F2K · Friday Movie Night</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          {/* Fake video */}
          <div className="overflow-hidden rounded-xl bg-black">
            <div
              className="relative bg-gradient-to-br from-fuchsia-700/40 via-zinc-900 to-cyan-700/30"
              style={{ paddingTop: '56.25%' }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-2xl text-zinc-900 shadow-2xl animate-pulse">
                  ▶
                </div>
              </div>
              <div className="absolute right-3 top-3 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold tracking-wider text-black animate-pulse">
                SYNCED
              </div>
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-zinc-700">
                  <div className="h-full w-1/3 rounded-full bg-fuchsia-400" />
                </div>
                <div className="font-mono text-[10px] text-zinc-300">1:24 / 4:08</div>
              </div>
            </div>
          </div>
          {/* Fake chat */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/80 p-2">
            <div className="text-[10px] font-semibold tracking-wider text-zinc-400">
              CHAT · 4 watching
            </div>
            <div className="mt-2 flex-1 space-y-1.5 overflow-hidden text-xs">
              <ChatBubble who="🦊 Riley" mine={false}>
                no waayyyy 🤣
              </ChatBubble>
              <ChatBubble who="🌸 Nova" mine={false}>
                this part again
              </ChatBubble>
              <ChatBubble who="You" mine>
                queueing the next one
              </ChatBubble>
              <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-400" />
                typing…
              </div>
            </div>
            <div className="mt-2 rounded-md border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
              Message…
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ who, mine, children }) {
  return (
    <div className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
      <div
        className={
          'max-w-[85%] rounded-lg px-2 py-1 ' +
          (mine ? 'bg-fuchsia-500/20 text-zinc-100' : 'bg-zinc-800 text-zinc-100')
        }
      >
        <div
          className={
            'text-[9px] font-semibold ' +
            (mine ? 'text-fuchsia-300' : 'text-cyan-300')
          }
        >
          {who}
        </div>
        <div className="text-[11px] leading-tight">{children}</div>
      </div>
    </div>
  )
}
