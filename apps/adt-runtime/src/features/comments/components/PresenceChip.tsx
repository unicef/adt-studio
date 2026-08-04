import { useAtomValue } from "jotai"
import { readableTextColor } from "@/features/comments/lib/color"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { otherPeersAtom, presenceVisibleAtom } from "@/features/comments/state/presence.atoms"

/** Four faces and a "+n" — beyond that the stack stops being a stack and starts being a wall. */
const MAX_FACES = 4

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?"
}

/**
 * Who else is reading, as an avatar stack above the dock.
 *
 * It appears only when somebody else is actually in the room, and it is the accessible half of
 * presence: the cursors themselves are decorative, so this is where the count and the names are
 * announced. A reader alone in a book sees nothing at all — presence must never be a permanent
 * badge that says "nobody".
 */
export function PresenceChip() {
  const { t } = useCommentsText()
  const visible = useAtomValue(presenceVisibleAtom)
  const peers = useAtomValue(otherPeersAtom)

  if (!visible) return null

  const faces = peers.slice(0, MAX_FACES)
  const overflow = peers.length - faces.length
  const label =
    peers.length === 1
      ? t("comments-presence-one-label")
      : t("comments-presence-count-label", { count: String(peers.length) })

  return (
    <div
      role="status"
      aria-live="polite"
      title={peers.map((peer) => peer.name).join(", ")}
      className="pointer-events-none fixed bottom-[calc(var(--dock-height,5rem)+1rem)] right-4 z-40 flex items-center gap-2 rounded-full bg-popover/95 py-1 pl-1.5 pr-3 shadow-md ring-1 ring-border backdrop-blur-md duration-300 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <span className="flex items-center">
        {faces.map((peer, index) => (
          <span
            key={peer.id}
            style={{ backgroundColor: peer.color, color: readableTextColor(peer.color) }}
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-bold leading-none ring-2 ring-popover duration-300 animate-in zoom-in-50 motion-reduce:animate-none ${
              index === 0 ? "" : "-ml-1.5"
            }`}
          >
            {initialOf(peer.name)}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="-ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[0.625rem] font-bold leading-none text-muted-foreground ring-2 ring-popover">
            {`+${overflow}`}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-medium text-popover-foreground">{label}</span>
    </div>
  )
}
