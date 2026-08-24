import { useAtomValue } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { readableTextColor } from "@/features/comments/lib/color"
import { CURSOR_OFFSCREEN_STALE_MS, visibleCursors } from "@/features/comments/lib/presence"
import { ROOM_CURSOR_STALE_MS } from "@/features/comments/lib/room-protocol"
import {
  placeCursor,
  scrollDeltaToReveal,
  spreadAlongEdges,
  type CursorEdge,
} from "@/features/comments/lib/cursor-edge"
import { useAnchorPositions, type AnchorTarget } from "@/features/comments/hooks/useAnchorPositions"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { useViewportSize } from "@/features/comments/hooks/useViewportSize"
import {
  peerCursorsAtom,
  roomPeersAtom,
  selfPeerIdAtom,
} from "@/features/comments/state/presence.atoms"

const DIRECTION_KEY = {
  top: "comments-cursor-direction-up-label",
  bottom: "comments-cursor-direction-down-label",
  left: "comments-cursor-direction-left-label",
  right: "comments-cursor-direction-right-label",
} as const

/** Points away from the screen, at the peer: the marker says which way to go. */
/**
 * The tail, drawn *outside* the pill and pointing away from the screen.
 *
 * Outside rather than inside because the tail is not an icon: it is the marker saying "over
 * there", the way a speech bubble points at whoever is speaking. Set among the letters it reads
 * as decoration on a label; hanging off the edge it reads as a direction.
 */
export const TAIL = {
  top: "M7 0 L14 9 L0 9 Z",
  bottom: "M7 9 L0 0 L14 0 Z",
  left: "M0 7 L9 0 L9 14 Z",
  right: "M9 7 L0 14 L0 0 Z",
} as const

/** Long side against the pill, point away from it. */
export const TAIL_BOX = {
  top: { width: 14, height: 9 },
  bottom: { width: 14, height: 9 },
  left: { width: 9, height: 14 },
  right: { width: 9, height: 14 },
} as const

function edgeAnchorClass(edge: CursorEdge): string {
  /** Translated so the marker hangs off the edge it belongs to rather than being centred on the
   *  clamped point, which would put half of it outside the window. */
  if (edge === "top") return "-translate-x-1/2 translate-y-0 flex-col"
  if (edge === "bottom") return "-translate-x-1/2 -translate-y-full flex-col"
  if (edge === "left") return "translate-x-0 -translate-y-1/2 flex-row"
  return "-translate-x-full -translate-y-1/2 flex-row"
}

/** The tail leads on the edges that point back towards the window, and trails on the others. */
export function tailFirst(edge: CursorEdge): boolean {
  return edge === "top" || edge === "left"
}

/**
 * Other people's cursors, drawn where they are pointing rather than where their pointer is.
 *
 * A cursor travels as an anchor — a selector into `#content` plus a percentage inside the
 * matched box — and is resolved back through the very same engine that positions pins. That is
 * the whole reason a phone and a laptop reading the same page see each other point at the same
 * *word* instead of at the same pixel of two differently-reflowed columns.
 *
 * A peer further down the same page gets an edge marker instead of being clipped away. The
 * arrows are decorative and stay hidden from assistive technology, but the edge markers are
 * real buttons in their own labelled layer: "somebody is reading three screens down" is
 * navigation, not decoration, and it is the one thing here worth offering to a keyboard.
 */
function Tail({ edge }: { edge: CursorEdge }) {
  const box = TAIL_BOX[edge]
  return (
    <svg
      width={box.width}
      height={box.height}
      viewBox={`0 0 ${box.width} ${box.height}`}
      className="shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]"
      aria-hidden
    >
      <path d={TAIL[edge]} fill="currentColor" />
    </svg>
  )
}

export function PeerCursors() {
  const peers = useAtomValue(roomPeersAtom)
  const selfId = useAtomValue(selfPeerIdAtom)
  const cursors = useAtomValue(peerCursorsAtom)
  const sectionId = useAtomValue(currentSectionIdAtom)
  const viewport = useViewportSize()
  const { t } = useCommentsText()

  /**
   * Collected at the longer off-screen window, then split by where each peer landed: an arrow is
   * only drawn for a cursor still fresh by the pointing standard, while an edge marker survives
   * on the ambient one. Filtering at the short window first would drop the very peers the edge
   * markers exist for — somebody reading three screens down is not moving their mouse.
   */
  /**
   * A once-a-second clock, only while somebody's cursor is in state.
   *
   * Ages are compared against it rather than against `Date.now()` at render time, because
   * nothing else re-renders this overlay while a peer sits still: the pruner returns the very
   * same array when it drops nothing, so an arrow crossing its freshness boundary would
   * otherwise stay on screen until an unrelated render happened to clear it.
   */
  const [now, setNow] = useState(() => Date.now())
  const ticking = cursors.length > 0
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [ticking])

  const visible = useMemo(
    () =>
      visibleCursors(
        cursors,
        peers,
        selfId,
        sectionId ?? null,
        now,
        CURSOR_OFFSCREEN_STALE_MS,
      ),
    [cursors, now, peers, sectionId, selfId],
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

  const placed = useMemo(() => {
    const withPlacement = visible.flatMap((entry) => {
      const point = positions.get(entry.cursor.peerId)
      if (!point) return []
      return [{ entry, point, placement: placeCursor(point, viewport) }]
    })
    return spreadAlongEdges(withPlacement, viewport)
  }, [positions, viewport, visible])

  if (placed.length === 0) return null

  /** An arrow claims "pointing here, now" and holds only to the short window; an edge marker
   *  claims "reading over there" and holds to the long one. */
  const onscreen = placed.filter(
    (item) =>
      item.placement.kind === "onscreen" && now - item.entry.cursor.at < ROOM_CURSOR_STALE_MS,
  )
  const offscreen = placed.filter((item) => item.placement.kind === "edge")

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
        data-peer-cursors=""
      >
        {onscreen.map(({ entry, placement }) => {
          const color = entry.peer.color
          return (
            <div
              key={entry.cursor.peerId}
              className="absolute left-0 top-0 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
              style={{
                transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`,
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
                className="absolute left-3 top-3.5 max-w-[10rem] truncate px-2 py-0.5 text-[0.6875rem] font-semibold leading-tight shadow-sm"
                style={{
                  backgroundColor: color,
                  color: readableTextColor(color),
                  /** Sharp where it meets the arrow, round elsewhere: the label reads as a flag
                   *  flown from the cursor rather than a separate bubble drifting beside it. */
                  borderRadius: "3px 12px 12px 12px",
                }}
              >
                {entry.peer.name}
              </span>
            </div>
          )
        })}
      </div>

      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" data-peer-edges="">
        {offscreen.map(({ entry, point, placement }) => {
          if (placement.kind !== "edge") return null
          const color = entry.peer.color
          const direction = t(DIRECTION_KEY[placement.edge])
          return (
            <button
              key={entry.cursor.peerId}
              type="button"
              title={t("comments-cursor-offscreen-label", { name: entry.peer.name, direction })}
              aria-label={t("comments-cursor-offscreen-label", {
                name: entry.peer.name,
                direction,
              })}
              onClick={() => {
                const delta = scrollDeltaToReveal(point, viewport)
                window.scrollBy({ left: delta.x, top: delta.y, behavior: "smooth" })
              }}
              className={`pointer-events-auto absolute left-0 top-0 flex items-center justify-center gap-[3px] bg-transparent p-0 duration-200 animate-in fade-in-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:animate-none ${edgeAnchorClass(placement.edge)}`}
              style={{
                marginLeft: placement.x,
                marginTop: placement.y,
                color,
                transition: "margin 90ms linear",
              }}
            >
              {tailFirst(placement.edge) ? <Tail edge={placement.edge} /> : null}
              <span
                className="max-w-[11rem] truncate rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold leading-tight shadow-sm"
                style={{ backgroundColor: color, color: readableTextColor(color) }}
              >
                {entry.peer.name}
              </span>
              {tailFirst(placement.edge) ? null : <Tail edge={placement.edge} />}
            </button>
          )
        })}
      </div>
    </>
  )
}
