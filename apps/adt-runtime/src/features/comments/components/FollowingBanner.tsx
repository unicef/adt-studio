import { useAtomValue, useSetAtom } from "jotai"
import { Eye } from "lucide-react"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { findFollowed } from "@/features/comments/lib/follow"
import { followedPeerAtom } from "@/features/comments/state/follow.atoms"
import { otherPeersAtom } from "@/features/comments/state/presence.atoms"

const FALLBACK_COLOR = "#6366f1"

/**
 * That you are being carried around the book by somebody else is the most surprising state this
 * reader can be in, so it says so twice: a ring around the whole viewport in the followed
 * reader's own colour — the same colour as their cursor and their avatar, so no legend is needed
 * — and a banner naming them with the way out attached.
 *
 * The ring is drawn even while the followed peer is briefly absent (a page turn removes them
 * from the roster for a moment), because a border that blinks on every page turn would be worse
 * than one that stays.
 */
export function FollowingBanner() {
  const { t } = useCommentsText()
  const followed = useAtomValue(followedPeerAtom)
  const peers = useAtomValue(otherPeersAtom)
  const setFollowed = useSetAtom(followedPeerAtom)

  if (followed === null) return null
  /** The name recorded when the follow started, not one looked up now: the banner has to keep
   *  naming somebody through the gap where their socket is reconnecting. */
  const name = followed.name

  const color = findFollowed(peers, followed.id)?.color ?? FALLBACK_COLOR

  return (
    <>
      <div
        aria-hidden
        style={{ borderColor: color }}
        className="pointer-events-none fixed inset-0 z-30 border-[3px] duration-300 animate-in fade-in-0 motion-reduce:animate-none"
      />

      <div
        role="status"
        className="fixed bottom-[calc(var(--dock-height,5rem)+1rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-popover/95 px-3.5 py-1.5 text-xs shadow-md ring-1 ring-border backdrop-blur-md duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
      >
        <Eye className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />
        <span className="font-medium text-popover-foreground">
          {t("comments-following-banner-label", { name })}
        </span>
        <button
          type="button"
          onClick={() => setFollowed(null)}
          className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          {t("comments-follow-stop-label")}
        </button>
      </div>
    </>
  )
}
