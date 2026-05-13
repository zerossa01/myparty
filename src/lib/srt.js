/**
 * Minimal SRT (SubRip) parser.
 *
 * Accepts the contents of a .srt file (string) and returns an array of cues:
 *   [{ start: secondsNumber, end: secondsNumber, text: string }, ...]
 *
 * Also tolerates:
 *   - Windows line endings (\r\n)
 *   - UTF-8 BOM
 *   - Missing leading index numbers
 *   - Decimal millisecond separators (',' or '.')
 *   - Inline HTML tags (<i>, <b>, …) — stripped
 *   - ASS-style positioning tags like {\an8} — stripped
 */
export function parseSrt(text) {
  if (!text || typeof text !== 'string') return []
  const norm = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim()
  if (!norm) return []

  const blocks = norm.split(/\n{2,}/)
  const cues = []

  for (const raw of blocks) {
    const lines = raw.split('\n').filter((l) => l.length > 0 || true) // keep blanks inside
    if (lines.length < 2) continue

    // First line may be an integer index — skip if so.
    let i = 0
    if (/^\d+$/.test(lines[0].trim())) i = 1
    if (i >= lines.length) continue

    const timing = lines[i]
    const m = timing.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    )
    if (!m) continue

    const start = toSeconds(m[1], m[2], m[3], m[4])
    const end = toSeconds(m[5], m[6], m[7], m[8])
    if (!(end > start)) continue

    const textBody = lines.slice(i + 1).join('\n').trim()
    if (!textBody) continue

    cues.push({ start, end, text: cleanText(textBody) })
  }

  // Stable sort by start time so binary search works.
  cues.sort((a, b) => a.start - b.start)
  return cues
}

function toSeconds(h, m, s, ms) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

function cleanText(t) {
  return t
    .replace(/\{\\[^}]+\}/g, '')           // ASS positioning tags
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')    // any HTML-like tag
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Find the cue active at `time` (binary search). Returns the cue or null.
 */
export function findActiveCue(cues, time) {
  if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(time)) return null
  let lo = 0
  let hi = cues.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const c = cues[mid]
    if (time < c.start) hi = mid - 1
    else if (time >= c.end) lo = mid + 1
    else return c
  }
  return null
}
