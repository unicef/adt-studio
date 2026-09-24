/**
 * The reviewer-facing slice of the publish-comments contract.
 *
 * Shapes are imported as *types* from @adt/types, so the single source of truth
 * is shared with the worker and the Studio at zero runtime cost — a value
 * import would pull zod into every published book's bundle. The few numeric
 * caps the UI needs are therefore restated here, and
 * `contract.test.ts` fails if they ever drift from @adt/types.
 */
import type {
  CommenterSession,
  PublishComment,
  PublishCommentCreateRequest,
  PublishCommentListResponse,
} from "@adt/types"

export type { CommenterSession, PublishComment, PublishCommentCreateRequest, PublishCommentListResponse }

export const COMMENT_BODY_MAX_LENGTH = 2000

export const COMMENTER_NAME_MAX_LENGTH = 60

/** Dormant since M3.5 — the reader UI no longer offers PINs (the access code on the door does
 *  that job now), but the worker route and this client's `claimSession` still exist, so the caps
 *  stay here under `contract.test.ts`'s drift check rather than being re-derived if it returns.
 *  The product ruling was a numeric PIN; the contract's 4–12 any-character range is wider than
 *  what the UI offered, and 6 kept it memorable. */
export const COMMENTER_PIN_MIN_LENGTH = 4

export const COMMENTER_PIN_MAX_LENGTH = 6

export type PublishErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "name_taken"
  | "invalid_claim"
  | "expired"
  | "revoked"
  | "payload_too_large"
  | "rate_limited"
  | "not_implemented"
  | "internal_error"

export function isRootComment(comment: PublishComment): boolean {
  return comment.parent_id === null
}

export function rootComments(comments: PublishComment[]): PublishComment[] {
  return comments.filter(isRootComment)
}

export function repliesOf(comments: PublishComment[], rootId: string): PublishComment[] {
  return comments.filter((comment) => comment.parent_id === rootId)
}
