/**
 * SourceTabs — horizontal row of platform "pills" above the URL input.
 * The selected tab controls what picker/input UI is shown.
 *
 * Props:
 *   - value:    current tab id
 *   - onChange: (newTabId) => void
 *   - disabled: bool — disable all (guest side)
 */
const TABS = [
  { id: 'youtube', label: 'YouTube',  hint: '🔎' },
  { id: 'twitch',  label: 'Twitch',   hint: '🟣' },
  { id: 'vimeo',   label: 'Vimeo',    hint: '🟦' },
  { id: 'direct',  label: 'File URL', hint: '📁' },
  { id: 'drive',   label: 'Drive',    hint: '💾' },
]

export default function SourceTabs({ value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange?.(t.id)}
            disabled={disabled}
            className={
              'min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition ' +
              (active
                ? 'border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-100'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800') +
              (disabled ? ' cursor-not-allowed opacity-50' : '')
            }
          >
            <span className="mr-1">{t.hint}</span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export { TABS }
