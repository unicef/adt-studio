import type { Context } from "hono"
import type { PublishErrorCode } from "@adt/types"

export const COMMENTS_OFF_MESSAGE = "Comments are off for this book."

export type PublishErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 500 | 501

export function errorResponse(
  c: Context,
  error: PublishErrorCode,
  status: PublishErrorStatus,
  message?: string,
): Response {
  return c.json(message === undefined ? { error } : { error, message }, status)
}
