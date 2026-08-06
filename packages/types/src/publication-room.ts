import { z } from "zod"
import { COMMENTER_NAME_MAX_LENGTH } from "./commenter-name.js"
import { PublishComment } from "./publish-comment.js"

/**
 * The realtime room protocol (M6): live cursors and live pin events on a published book.
 *
 * One Durable Object per publication, plain JSON frames over one WebSocket, no CRDT and no
 * third-party realtime dependency. Everything here is shape-only — the worker validates
 * incoming frames against these schemas, the Studio validates the server's, and the published
 * runtime type-imports them so zod never reaches a reader's bundle.
 */

/** Refused politely beyond this many concurrent sockets per publication. A classroom is the
 *  target size; a room that grows past it is a sign of a leaked link, not of demand. */
export const PUBLICATION_ROOM_MAX_PEERS = 64

/** Anything larger is dropped unparsed. A cursor frame is ~140 bytes. */
export const PUBLICATION_ROOM_MAX_FRAME_BYTES = 4096

/** The author's join credential is single-purpose and lives for one minute — long enough for
 *  a browser to open a socket, short enough that a copied URL is worthless. */
export const PUBLICATION_ROOM_TICKET_TTL_SECONDS = 60

export const PUBLICATION_ROOM_TICKET_PARAM = "ticket"

/** Minimum gap between outgoing cursor frames. 30ms is ~33/s: smooth to the eye and an order
 *  of magnitude below what a pointer device reports. */
export const PUBLICATION_ROOM_CURSOR_THROTTLE_MS = 30

/** A cursor with no update for this long is hidden. Covers the cases no frame reports: a
 *  pointer that left the window, a laptop lid closing, a socket dying without a close. */
export const PUBLICATION_ROOM_CURSOR_STALE_MS = 5000

/** A reader who never commented has no session and therefore no name. They are still a
 *  presence — hiding them would be a lie about who is in the room. */
export const PUBLISH_ANONYMOUS_NAME = "Someone"

/** Neutral zinc, deliberately outside `COMMENTER_COLORS` and distinct from the author's grey:
 *  an unnamed peer must not look like a named one whose name failed to load. */
export const PUBLISH_ANONYMOUS_COLOR = "#a1a1aa"

/** Room membership is per *socket*, not per session: two tabs are two cursors, which is what
 *  the roster is counting. The id is minted per connection and is never a credential. */
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

export const ROOM_COMMENT_EVENTS = [
  "comment-created",
  "comment-updated",
  "comment-deleted",
  "comment-resolved",
] as const

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
