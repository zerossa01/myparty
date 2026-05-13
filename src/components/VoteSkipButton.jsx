/**
 * VoteSkipButton — anyone in the room can vote to skip the current video.
 * When more than half the present viewers vote, the host clears the media.
 *
 * Props:
 *   myVote:     bool — has the current user already voted?
 *   voteCount:  number of votes for the current video
 *   voteNeeded: minimum votes to clear the video
 *   disabled:   bool — hide/disable when no media is loaded
 *   onVote:     () => void
 */
export default function VoteSkipButton({
  myVote,
  voteCount,
  voteNeeded,
  disabled,
  onVote,
}) {
  if (disabled) return null
  return (
    <button
      type="button"
      onClick={onVote}
      disabled={myVote}
      className={
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ' +
        (myVote
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 cursor-default'
          : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-amber-500/60 hover:text-amber-200')
      }
      title={myVote ? 'You voted to skip' : 'Vote to skip this video'}
    >
      <span>⏭️</span>
      <span className="hidden sm:inline">{myVote ? 'Voted' : 'Skip'}</span>
      <span className="rounded-full bg-black/30 px-1.5 text-[10px]">
        {voteCount}/{voteNeeded}
      </span>
    </button>
  )
}
