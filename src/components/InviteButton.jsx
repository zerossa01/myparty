import { useState } from 'react'

export default function InviteButton({ code }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = `${window.location.origin}/join/${code}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* */ }
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
    >
      <span>{copied ? '✓' : '🔗'}</span>
      <span>{copied ? 'Copied!' : 'Copy invite link'}</span>
    </button>
  )
}
