import { createMiddleware } from "hono/factory"
import type { Env } from "../env.js"
import { errorResponse } from "../errors.js"

const BEARER_PREFIX = "Bearer "

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export const mgmtAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const secret = c.env?.MGMT_SECRET
  const header = c.req.header("Authorization") ?? ""
  const presented = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : ""

  if (!secret || presented.length === 0 || !constantTimeEqual(presented, secret)) {
    return errorResponse(c, "unauthorized", 401)
  }

  return next()
})
