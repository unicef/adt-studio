import { z } from "zod"

export interface ValidatedEndpoint {
  /** The URL as configured, minus any credentials or fragment. */
  url: string
  /** `protocol//host[:port]` — the non-secret identity used in cache keys. */
  origin: string
}

/**
 * Embedded credentials are rejected and query strings dropped because both would
 * leak a key into logs and cache fingerprints.
 */
export function validateEndpointUrl(raw: string): ValidatedEndpoint {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error(`Invalid endpoint URL: ${redactUrl(raw)}`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Endpoint URL must use http or https, got "${parsed.protocol}"`)
  }
  if (parsed.username || parsed.password) {
    throw new Error("Endpoint URL must not embed a username or password")
  }
  if (!parsed.hostname) {
    throw new Error("Endpoint URL must include a hostname")
  }

  parsed.hash = ""
  parsed.search = ""

  return {
    url: parsed.toString().replace(/\/$/, ""),
    origin: parsed.origin,
  }
}

/** Validates AND normalizes, so the stored value never carries a query string. */
export const EndpointUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value, ctx) => {
    try {
      return validateEndpointUrl(value).url
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "invalid endpoint URL",
      })
      return z.NEVER
    }
  })

/** Strip credentials and query from a URL so it is safe to put in an error message. */
export function redactUrl(raw: string): string {
  try {
    const parsed = new URL(raw)
    parsed.username = ""
    parsed.password = ""
    parsed.search = parsed.search ? "?<redacted>" : ""
    return parsed.toString()
  } catch {
    return "<unparseable url>"
  }
}
