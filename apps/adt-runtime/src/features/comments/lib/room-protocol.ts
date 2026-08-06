/**
 * The reviewer-facing slice of the realtime room protocol.
 *
 * Shapes are imported as *types* from @adt/types, exactly like `contract.ts` does: a value
 * import would pull zod into every published book's bundle for the sake of validating frames
 * that already came from the book's own worker. The guards below are hand-rolled and total —
 * a frame that does not match is dropped, so a worker one version ahead can add a frame type
 * without breaking a reader on an older snapshot.
 *
 * The numeric constants are restated rather than imported for the same reason, and
 * `room-protocol.test.ts` fails if they drift from @adt/types.
 */
import type {
  PublishComment,
  RoomCommentEvent,
  RoomDevice,
  RoomPeer,
  RoomPeerCursorFrame,
  RoomPresenceFrame,
  RoomServerFrame,
} from "@adt/types"

export type { RoomDevice, RoomPeer, RoomPeerCursorFrame, RoomPresenceFrame, RoomServerFrame }

export const ROOM_MAX_PEERS = 64

export const ROOM_CURSOR_THROTTLE_MS = 30

export const ROOM_CURSOR_STALE_MS = 5000

export const ROOM_TICKET_PARAM = "ticket"

export const ANONYMOUS_PEER_NAME = "Someone"

export const ANONYMOUS_PEER_COLOR = "#a1a1aa"

const COMMENT_EVENTS: readonly string[] = [
  "comment-created",
  "comment-updated",
  "comment-deleted",
  "comment-resolved",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

const DEVICES: readonly string[] = ["full", "tablet", "phone"]

/** A worker that predates the device field sends peers without one. Defaulting rather than
 *  rejecting keeps those readers in the roster — they are simply reading at full width, which
 *  is what everyone who has never touched the preview is doing. */
export function deviceOf(peer: RoomPeer): RoomDevice {
  const value = (peer as { device?: unknown }).device
  return typeof value === "string" && DEVICES.includes(value) ? (value as RoomDevice) : "full"
}

function isPeer(value: unknown): value is RoomPeer {
  if (!isRecord(value)) return false
  return (
    isText(value.id) &&
    isText(value.name) &&
    isText(value.color) &&
    typeof value.is_author === "boolean" &&
    (value.page_section_id === null || isText(value.page_section_id))
  )
}

export function isPresenceFrame(frame: RoomServerFrame): frame is RoomPresenceFrame {
  return frame.t === "presence"
}

export function isCursorFrame(frame: RoomServerFrame): frame is RoomPeerCursorFrame {
  return frame.t === "cursor"
}

export function isCommentEvent(value: string): value is RoomCommentEvent {
  return COMMENT_EVENTS.includes(value)
}

/** The comment payload is only shallow-checked: it came from the same worker the reader is
 *  already trusting for the page's HTML, and the fields the overlay reads are these. */
function isComment(value: unknown): value is PublishComment {
  if (!isRecord(value)) return false
  return (
    isText(value.id) &&
    isText(value.page_section_id) &&
    isText(value.author_name) &&
    isText(value.author_color) &&
    typeof value.body === "string" &&
    (value.parent_id === null || isText(value.parent_id))
  )
}

export function parseServerFrame(raw: unknown): RoomServerFrame | null {
  if (typeof raw !== "string") return null

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(payload) || typeof payload.t !== "string") return null

  if (payload.t === "presence") {
    if (!isText(payload.self_id) || !Array.isArray(payload.peers)) return null
    if (!payload.peers.every(isPeer)) return null
    return { t: "presence", self_id: payload.self_id, peers: payload.peers }
  }

  if (payload.t === "cursor") {
    if (!isText(payload.peer_id) || !isText(payload.section_id) || !isText(payload.selector)) {
      return null
    }
    if (!isPercent(payload.xOffsetPct) || !isPercent(payload.yOffsetPct)) return null
    return {
      t: "cursor",
      peer_id: payload.peer_id,
      section_id: payload.section_id,
      selector: payload.selector,
      xOffsetPct: payload.xOffsetPct,
      yOffsetPct: payload.yOffsetPct,
    }
  }

  if (isCommentEvent(payload.t) && isComment(payload.comment)) {
    return { t: payload.t, comment: payload.comment }
  }

  return null
}
