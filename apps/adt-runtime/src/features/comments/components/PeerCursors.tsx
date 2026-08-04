import { useAtomValue } from "jotai"
import { useMemo } from "react"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { readableTextColor } from "@/features/comments/lib/color"
import { visibleCursors } from "@/features/comments/lib/presence"
import { useAnchorPositions, type AnchorTarget } from "@/features/comments/hooks/useAnchorPositions"
import {
  peerCursorsAtom,
  roomPeersAtom,
  selfPeerIdAtom,
} from "@/features/comments/state/presence.atoms"

/**
 * Other people's cursors, drawn where they are pointing rather than where their pointer is.
 *
 * A cursor travels as an anchor — a selector into `#content` plus a percentage inside the
 * matched box — and is resolved back through the very same engine that positions pins. That is
 * the whole reason a phone and a laptop reading the same page see each other point at the same
 * *word* instead of at the same pixel of two differently-reflowed columns.
 *
 * Purely decorative: the overlay is `aria-hidden`, because a cursor is a thing to watch, and a
 * screen-reader user is told about the people in the room by the presence chip instead.
 */
export function PeerCursors() {
  const peers = useAtomValue(roomPeersAtom)
  const selfId = useAtomValue(selfPeerIdAtom)
  const cursors = useAtomValue(peerCursorsAtom)
  const sectionId = useAtomValue(currentSectionIdAtom)

  const visible = useMemo(
    () => visibleCursors(cursors, peers, selfId, sectionId ?? null, Date.now()),
    [cursors, peers, sectionId, selfId],
  )

  const targets = useMemo<AnchorTarget[]>(
    () =>
      visible.map((entry) => ({
        id: entry.cursor.peerId,
        anchor: {
          selector: entry.cursor.selector,
          xOffsetPct: entry.cursor.xOffsetPct,
          yOffsetPct: entry.cursor.yOffsetPct,
        },
      })),
    [visible],
  )
  const positions = useAnchorPositions(targets)

  if (visible.length === 0) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      data-peer-cursors=""
    >
      {visible.map((entry) => {
        const point = positions.get(entry.cursor.peerId)
        if (!point) return null
        const color = entry.peer.color
        return (
          <div
            key={entry.cursor.peerId}
            className="absolute left-0 top-0 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
            style={{
              transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
              /** Short and linear: a cursor should read as *moving*, not as easing into place,
               *  and 70ms is just over two of the sender's 30ms frames. */
              transition: "transform 70ms linear",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
            >
              <path
                d="M2 1.5 L2 14 L5.6 10.6 L8.2 16 L10.6 14.9 L8 9.7 L13 9.7 Z"
                fill={color}
                stroke="#ffffff"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="absolute left-3.5 top-4 max-w-[10rem] truncate rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-tight shadow-sm"
              style={{ backgroundColor: color, color: readableTextColor(color) }}
            >
              {entry.peer.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
