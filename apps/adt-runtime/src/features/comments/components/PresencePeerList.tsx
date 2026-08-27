import { useAtomValue, useSetAtom } from "jotai"
import { readableTextColor } from "@/features/comments/lib/color"
import { isFollowable, pageLabelFor } from "@/features/comments/lib/follow"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { pagesAtom, tocAtom } from "@/features/navigation/state/nav.atoms"
import { followedPeerAtom } from "@/features/comments/state/follow.atoms"
import { otherPeersAtom } from "@/features/comments/state/presence.atoms"
import type { RoomPeer } from "@/features/comments/lib/room-protocol"

export function PeerAvatar({ peer, size = "md" }: { peer: RoomPeer; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: peer.color, color: readableTextColor(peer.color) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold leading-none ring-2 ring-popover ${
        size === "sm" ? "h-5 w-5 text-[0.625rem]" : "h-7 w-7 text-xs"
      }`}
    >
      {[...peer.name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  )
}

/**
 * Everyone else in the room, with the page they are on and a way to go with them.
 *
 * Shared by the floating roster and the comments sidebar so the two can never disagree about
 * who is here — and so "follow" behaves identically wherever the reader happens to click it.
 */
export function PresencePeerList({ onFollow }: { onFollow?: () => void }) {
  const { t } = useCommentsText()
  const peers = useAtomValue(otherPeersAtom)
  const pages = useAtomValue(pagesAtom)
  const toc = useAtomValue(tocAtom)
  const following = useAtomValue(followedPeerAtom)
  const setFollowing = useSetAtom(followedPeerAtom)

  const labels = {
    unknown: t("comments-presence-unknown-page-label"),
    page: (number: number) => t("comments-presence-page-label", { number: String(number) }),
  }

  return (
    <ul className="flex list-none flex-col p-0">
      {peers.map((peer) => {
        const followable = isFollowable(peer)
        const isFollowed = following?.id === peer.id
        return (
          <li
            key={peer.id}
            className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
          >
            <PeerAvatar peer={peer} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium text-popover-foreground">
                {peer.name}
              </span>
              <span className="truncate text-[0.6875rem] text-muted-foreground">
                {pageLabelFor(peer, pages, toc, labels)}
              </span>
            </span>
            {followable ? (
              <button
                type="button"
                onClick={() => {
                  setFollowing(isFollowed ? null : { id: peer.id, name: peer.name })
                  if (!isFollowed) onFollow?.()
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${
                  isFollowed
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/70"
                }`}
              >
                {isFollowed ? t("comments-follow-stop-label") : t("comments-follow-label")}
              </button>
            ) : (
              <span
                title={t("comments-presence-anonymous-hint-label")}
                className="shrink-0 text-[0.6875rem] text-muted-foreground/70"
              >
                —
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
