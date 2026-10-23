import { z } from "zod"
import { CommenterDisplayName } from "./commenter-name.js"
import {
  COMMENTER_NAME_MAX_LENGTH,
  COMMENTER_PIN_MAX_LENGTH,
  COMMENTER_PIN_MIN_LENGTH,
  PUBLISH_COMMENT_BODY_MAX_LENGTH,
  PUBLISH_COMMENT_SELECTOR_MAX_LENGTH,
} from "./publication-limits.js"
import { PublicationToken } from "./publication.js"

export const COMMENTER_SESSION_COOKIE = "adt_pub_session"

export {
  COMMENTER_PIN_MIN_LENGTH,
  COMMENTER_PIN_MAX_LENGTH,
  PUBLISH_COMMENT_BODY_MAX_LENGTH,
  PUBLISH_COMMENT_LIST_PAGE_SIZE,
  PUBLISH_COMMENT_SELECTOR_MAX_LENGTH,
} from "./publication-limits.js"

/** 90 days. A reviewer who set a PIN can reclaim the identity anywhere; the long-lived
 *  cookie is what keeps the PIN prompt rare rather than every-visit. */
export const COMMENTER_SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60


/** Optional display name for the `MGMT_SECRET`-derived author session. The Studio has no
 *  user names yet, so the worker falls back to `PUBLISH_AUTHOR_DEFAULT_NAME`. */
export const PUBLISH_AUTHOR_NAME_HEADER = "X-Adt-Author-Name"

export const PUBLISH_AUTHOR_DEFAULT_NAME = "Author"

export const PUBLISH_AUTHOR_COLOR = "#8d8d8d"

export const COMMENTER_COLORS = [
  "#e5484d",
  "#f76808",
  "#ffb224",
  "#46a758",
  "#12a594",
  "#0091ff",
  "#3e63dd",
  "#8e4ec6",
  "#e93d82",
  "#8d8d8d",
] as const


export const CommentAnchor = z.object({
  selector: z.string().min(1),
  xOffsetPct: z.number().min(0).max(100),
  yOffsetPct: z.number().min(0).max(100),
})
export type CommentAnchor = z.infer<typeof CommentAnchor>

/** What a write may store. Kept apart from `CommentAnchor`, which also describes rows written
 *  before the cap, so a stored comment never fails to parse on its way back out. */
export const CommentAnchorInput = CommentAnchor.extend({
  selector: z.string().min(1).max(PUBLISH_COMMENT_SELECTOR_MAX_LENGTH),
})

const CommentId = z.string().min(1).max(64)
const PageSectionId = z.string().min(1).max(256)

export const CommenterSession = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(COMMENTER_NAME_MAX_LENGTH),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  is_author: z.boolean(),
})
export type CommenterSession = z.infer<typeof CommenterSession>

export const PublishComment = z.object({
  id: z.string().min(1),
  token: PublicationToken,
  version: z.number().int().min(1),
  page_section_id: z.string().min(1),
  parent_id: z.string().min(1).nullable(),
  session_id: z.string().min(1),
  author_name: z.string().min(1),
  author_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  body: z.string().max(PUBLISH_COMMENT_BODY_MAX_LENGTH),
  anchor: CommentAnchor.nullable(),
  resolved_at: z.string().datetime().nullable(),
  edited_at: z.string().datetime().nullable(),
  deleted_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
})
export type PublishComment = z.infer<typeof PublishComment>

/** No whitespace so a PIN cannot be trimmed into a different secret than the one typed. */
export const CommenterPin = z
  .string()
  .min(COMMENTER_PIN_MIN_LENGTH)
  .max(COMMENTER_PIN_MAX_LENGTH)
  .regex(/^\S+$/)
export type CommenterPin = z.infer<typeof CommenterPin>

export const CommenterSessionCreateRequest = z.object({
  name: CommenterDisplayName,
  pin: CommenterPin.optional(),
})
export type CommenterSessionCreateRequest = z.infer<typeof CommenterSessionCreateRequest>

export const CommenterSessionClaimRequest = z.object({
  name: CommenterDisplayName,
  pin: CommenterPin,
})
export type CommenterSessionClaimRequest = z.infer<typeof CommenterSessionClaimRequest>

export const CommenterSessionResponse = z.object({
  session: CommenterSession,
})
export type CommenterSessionResponse = z.infer<typeof CommenterSessionResponse>

export const PublishCommentCreateRequest = z.object({
  page_section_id: PageSectionId,
  body: z.string().trim().min(1).max(PUBLISH_COMMENT_BODY_MAX_LENGTH),
  anchor: CommentAnchorInput.nullable().optional(),
  parent_id: CommentId.nullable().optional(),
})
export type PublishCommentCreateRequest = z.infer<typeof PublishCommentCreateRequest>

export const PublishCommentUpdateRequest = z.object({
  body: z.string().trim().min(1).max(PUBLISH_COMMENT_BODY_MAX_LENGTH).optional(),
  anchor: CommentAnchorInput.nullable().optional(),
})
export type PublishCommentUpdateRequest = z.infer<typeof PublishCommentUpdateRequest>

export const PublishCommentResolveRequest = z.object({
  resolved: z.boolean(),
})
export type PublishCommentResolveRequest = z.infer<typeof PublishCommentResolveRequest>

export const PublishCommentListQuery = z.object({
  page_section_id: PageSectionId.optional(),
  version: z.coerce.number().int().min(1).optional(),
  include_resolved: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  /** Opaque: the `next_cursor` of the previous page. */
  cursor: z.string().min(1).max(256).optional(),
})
export type PublishCommentListQuery = z.infer<typeof PublishCommentListQuery>

export const PublishCommentListResponse = z.object({
  comments: z.array(PublishComment),
  session: CommenterSession.nullable(),
  /** Set while more rows remain; absent from Workers that answered every row at once. */
  next_cursor: z.string().nullable().optional(),
})
export type PublishCommentListResponse = z.infer<typeof PublishCommentListResponse>

export const PublishCommentResponse = z.object({
  comment: PublishComment,
})
export type PublishCommentResponse = z.infer<typeof PublishCommentResponse>
