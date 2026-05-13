import { useMemo } from 'react'
import { findActiveCue } from '../lib/srt.js'

/**
 * Renders the currently-active subtitle line on top of the video container.
 * Apply pointer-events:none so the overlay never blocks clicks on the player.
 *
 * Props:
 *   - cues:        [{start, end, text}, ...]
 *   - currentTime: seconds
 *   - offset:      optional offset in seconds (positive = subtitles appear later)
 */
export default function SubtitleOverlay({ cues, currentTime, offset = 0 }) {
  const cue = useMemo(
    () => findActiveCue(cues, (Number(currentTime) || 0) - offset),
    [cues, currentTime, offset]
  )
  if (!cue) return null

  return (
    <div
      className="pointer-events-none absolute bottom-[8%] left-1/2 z-30 max-w-[88%] -translate-x-1/2 rounded-md bg-black/60 px-3 py-1.5 text-center font-semibold text-white"
      style={{
        textShadow:
          '0 0 4px black, 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black',
        fontSize: 'clamp(14px, 2.2vw, 22px)',
        lineHeight: 1.25,
      }}
    >
      {cue.text.split('\n').map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  )
}
