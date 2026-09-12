import { z } from "zod"
import { COMMENTER_NAME_MAX_LENGTH, ROOM_COMMENT_EVENTS } from "./publication-limits.js"
import { PublishComment } from "./publish-comment.js"

/**
 * The realtime room protocol (M6): live cursors and live pin events on a published book.
 *
 * One Durable Object per publication, plain JSON frames over one WebSocket, no CRDT and no
 * third-party realtime dependency. Everything here is shape-only — the worker validates
 * incoming frames against these schemas, the Studio validates the server's, and the published
 * runtime type-imports them so zod never reaches a reader's bundle.
 */

export {
  PUBLICATION_ROOM_MAX_PEERS,
  PUBLICATION_ROOM_MAX_FRAME_BYTES,
  PUBLICATION_ROOM_TICKET_TTL_SECONDS,
  PUBLICATION_ROOM_TICKET_PARAM,
  PUBLICATION_ROOM_TAB_PARAM,
  PUBLICATION_ROOM_TAB_PATTERN,
  PUBLICATION_ROOM_CURSOR_THROTTLE_MS,
  PUBLICATION_ROOM_CURSOR_STALE_MS,
  PUBLISH_ANONYMOUS_NAME,
  PUBLISH_ANONYMOUS_COLOR,
  ROOM_COMMENT_EVENTS,
} from "./publication-limits.js"

/** The width a peer is reading at. `full` is a real window; the other two mean they are using
 *  the device preview. Travels with presence so a follower can match it — following somebody
 *  checking a phone layout while seeing a desktop one shows you the wrong problem.
 *
 *  `.catch("full")` rather than a bare enum: a peer on a newer snapshot may report a width this
 *  worker has never heard of, and the roster must survive that rather than drop them. */
export const RoomDevice = z.enum(["full", "tablet", "phone"]).catch("full")
export type RoomDevice = z.infer<typeof RoomDevice>

export const RoomPeer = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(COMMENTER_NAME_MAX_LENGTH),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  is_author: z.boolean(),
  /** The page this peer is reading, or `null` before their first `hello`. */
  page_section_id: z.string().min(1).nullable(),
  /** `default` so a peer stored by an older worker still parses out of its attachment. */
  device: RoomDevice.default("full"),
})
export type RoomPeer = z.infer<typeof RoomPeer>

/**
 * Client → server. Identity is **not** in this union: the worker derives name, color and
 * authorship from the connection's own credentials (§2.3 cookie, §4.17 ticket) before the
 * socket is ever accepted, so a peer cannot name themselves anything.
 */
export const RoomHelloFrame = z.object({
  t: z.literal("hello"),
  section_id: z.string().min(1).nullable().optional(),
  device: RoomDevice.optional(),
})
export type RoomHelloFrame = z.infer<typeof RoomHelloFrame>

export const RoomCursorMoveFrame = z.object({
  t: z.literal("cursor"),
  section_id: z.string().min(1),
  selector: z.string().min(1).max(512),
  xOffsetPct: z.number().min(0).max(100),
  yOffsetPct: z.number().min(0).max(100),
})
export type RoomCursorMoveFrame = z.infer<typeof RoomCursorMoveFrame>

/**
 * Client → server: where in the page this reader is *looking*, as against where they are
 * pointing.
 *
 * Same shape as a cursor and a separate frame on purpose, because the two claim different
 * things. A cursor exists only while a pointer moves, which means a reader on a tablet never has
 * one at all and a reader who has settled down to read loses theirs after five seconds — and
 * those are exactly the people the edge markers are meant to place. A viewport is reported
 * whenever the page moves under them, so it is the honest answer to "where are they", and it is
 * never drawn as an arrow: nobody is pointing at anything.
 */
export const RoomViewportFrame = z.object({
  t: z.literal("viewport"),
  section_id: z.string().min(1),
  selector: z.string().min(1).max(512),
  xOffsetPct: z.number().min(0).max(100),
  yOffsetPct: z.number().min(0).max(100),
})
export type RoomViewportFrame = z.infer<typeof RoomViewportFrame>

export const RoomPageFrame = z.object({
  t: z.literal("page"),
  section_id: z.string().min(1).nullable(),
})
export type RoomPageFrame = z.infer<typeof RoomPageFrame>

/** Sent when a reader switches the device preview, so anybody following them follows the width
 *  as well as the page. Its own frame rather than a field on `page`, because the two change
 *  independently — a reader can resize without turning a page for an hour. */
export const RoomDeviceFrame = z.object({
  t: z.literal("device"),
  device: RoomDevice,
})
export type RoomDeviceFrame = z.infer<typeof RoomDeviceFrame>

export const RoomClientFrame = z.discriminatedUnion("t", [
  RoomHelloFrame,
  RoomCursorMoveFrame,
  RoomViewportFrame,
  RoomPageFrame,
  RoomDeviceFrame,
])
export type RoomClientFrame = z.infer<typeof RoomClientFrame>

/** Server → client. `self_id` is how a client tells its own row out of the roster without
 *  having to be told its identity separately. */
export const RoomPresenceFrame = z.object({
  t: z.literal("presence"),
  self_id: z.string().min(1),
  peers: z.array(RoomPeer),
})
export type RoomPresenceFrame = z.infer<typeof RoomPresenceFrame>

export const RoomPeerCursorFrame = z.object({
  t: z.literal("cursor"),
  peer_id: z.string().min(1),
  section_id: z.string().min(1),
  selector: z.string().min(1).max(512),
  xOffsetPct: z.number().min(0).max(100),
  yOffsetPct: z.number().min(0).max(100),
})
export type RoomPeerCursorFrame = z.infer<typeof RoomPeerCursorFrame>

/** Server → client, relayed to the peers reading the same page, exactly as a cursor is. */
export const RoomPeerViewportFrame = z.object({
  t: z.literal("viewport"),
  peer_id: z.string().min(1),
  section_id: z.string().min(1),
  selector: z.string().min(1).max(512),
  xOffsetPct: z.number().min(0).max(100),
  yOffsetPct: z.number().min(0).max(100),
})
export type RoomPeerViewportFrame = z.infer<typeof RoomPeerViewportFrame>

export const RoomCommentEvent = z.enum(ROOM_COMMENT_EVENTS)
export type RoomCommentEvent = z.infer<typeof RoomCommentEvent>

/** Broadcast to every peer regardless of the page they are on: a Studio panel lists a whole
 *  publication, and a reader's dock badge counts a page it may not be looking at yet. */
export const RoomCommentFrame = z.object({
  t: RoomCommentEvent,
  comment: PublishComment,
})
export type RoomCommentFrame = z.infer<typeof RoomCommentFrame>

export const RoomServerFrame = z.discriminatedUnion("t", [
  RoomPresenceFrame,
  RoomPeerCursorFrame,
  RoomPeerViewportFrame,
  RoomCommentFrame.extend({ t: z.literal("comment-created") }),
  RoomCommentFrame.extend({ t: z.literal("comment-updated") }),
  RoomCommentFrame.extend({ t: z.literal("comment-deleted") }),
  RoomCommentFrame.extend({ t: z.literal("comment-resolved") }),
])
export type RoomServerFrame = z.infer<typeof RoomServerFrame>

/** What the author's Studio gets in exchange for `MGMT_SECRET`: a signed join credential and
 *  the absolute `wss://` address to spend it at. The secret itself never reaches the browser. */
export const PublicationRoomTicketResponse = z.object({
  ticket: z.string().min(1),
  ws_url: z.string().min(1),
  expires_at: z.string().datetime(),
})
export type PublicationRoomTicketResponse = z.infer<typeof PublicationRoomTicketResponse>
