import { z } from "zod"
import { PublicationToken } from "./publication.js"

export const COMMENTER_SESSION_COOKIE = "adt_pub_session"

export const COMMENTER_NAME_MAX_LENGTH = 60

export const PUBLISH_COMMENT_BODY_MAX_LENGTH = 2000

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

export const CommenterSessionCreateRequest = z.object({
  name: z.string().trim().min(1).max(COMMENTER_NAME_MAX_LENGTH),
})
export type CommenterSessionCreateRequest = z.infer<typeof CommenterSessionCreateRequest>

export const CommenterSessionResponse = z.object({
  session: CommenterSession,
})
export type CommenterSessionResponse = z.infer<typeof CommenterSessionResponse>

export const PublishCommentCreateRequest = z.object({
  page_section_id: z.string().min(1),
  body: z.string().trim().min(1).max(PUBLISH_COMMENT_BODY_MAX_LENGTH),
  anchor: CommentAnchor.nullable().optional(),
  parent_id: z.string().min(1).nullable().optional(),
})
export type PublishCommentCreateRequest = z.infer<typeof PublishCommentCreateRequest>

export const PublishCommentUpdateRequest = z.object({
  body: z.string().trim().min(1).max(PUBLISH_COMMENT_BODY_MAX_LENGTH).optional(),
  anchor: CommentAnchor.nullable().optional(),
})
export type PublishCommentUpdateRequest = z.infer<typeof PublishCommentUpdateRequest>

export const PublishCommentResolveRequest = z.object({
  resolved: z.boolean(),
})
export type PublishCommentResolveRequest = z.infer<typeof PublishCommentResolveRequest>

export const PublishCommentListQuery = z.object({
  page_section_id: z.string().min(1).optional(),
  version: z.coerce.number().int().min(1).optional(),
  include_resolved: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
})
export type PublishCommentListQuery = z.infer<typeof PublishCommentListQuery>

export const PublishCommentListResponse = z.object({
  comments: z.array(PublishComment),
  session: CommenterSession.nullable(),
})
export type PublishCommentListResponse = z.infer<typeof PublishCommentListResponse>

export const PublishCommentResponse = z.object({
  comment: PublishComment,
})
export type PublishCommentResponse = z.infer<typeof PublishCommentResponse>
