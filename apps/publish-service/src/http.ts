import type { Context } from "hono"
import type { z } from "zod"

export type JsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; raw: unknown; message: string }

export async function readJsonBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<JsonBodyResult<z.infer<S>>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return { ok: false, raw: null, message: "Expected a JSON body" }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, raw: body, message: parsed.error.message }
  }

  return { ok: true, data: parsed.data }
}

/** A body over the cap is `413 payload_too_large` per the error table, not a Zod `400`. */
export function exceedsLength(raw: unknown, field: string, max: number): boolean {
  if (typeof raw !== "object" || raw === null) return false
  const value = (raw as Record<string, unknown>)[field]
  return typeof value === "string" && value.trim().length > max
}
