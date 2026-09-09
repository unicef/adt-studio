/**
 * Every publish constant a published book's own bundle needs, with no imports at all.
 *
 * The reader runtime cannot import the `@adt/types` barrel: it is built from zod schemas, and a
 * value import would put zod inside every book we publish. Until this module existed the runtime
 * restated these numbers by hand and a pair of drift tests kept the copies honest — which caught
 * nothing, because the copies were edited together, and let `COMMENTER_PIN_MAX_LENGTH` sit at 6
 * on one side and 12 on the other for a whole milestone.
 *
 * Exposed as `@adt/types/limits`, alongside `./color` and `./fingerprint`, which exist for the
 * same reason. Keep this file free of imports — that property is the whole point of it.
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

/**
 * Query param carrying the reader's *tab*, so a peer keeps one identity across a page turn.
 *
 * Every navigation in a published book is a document reload, and the peer id used to be minted
 * fresh per connection — so turning a page looked, to everybody else in the room, like a reader
 * leaving and a stranger arriving. The roster blinked, and anything keyed on a peer had to key
 * on a display name instead, which is why two readers called Ana were indistinguishable.
 *
 * Only the *tab* comes from the client. The identity it is combined with is taken from the
 * connection's own credentials, server-side, so supplying somebody else's tab cannot borrow
 * their name: the worst a client can do is split or merge its own tabs.
 */
export const PUBLICATION_ROOM_TAB_PARAM = "tab"

/** Bounds what is accepted from the client, since it lands in a header and a roster key. */
export const PUBLICATION_ROOM_TAB_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

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

/** Comment lifecycle events the room broadcasts to every peer regardless of page. */
export const ROOM_COMMENT_EVENTS = [
  "comment-created",
  "comment-updated",
  "comment-deleted",
  "comment-resolved",
] as const

export const COMMENTER_NAME_MAX_LENGTH = 60

export const PUBLISH_COMMENT_BODY_MAX_LENGTH = 2000

export const COMMENTER_PIN_MIN_LENGTH = 4

export const COMMENTER_PIN_MAX_LENGTH = 12
