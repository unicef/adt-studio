/**
 * A published snapshot is served from the publish worker under `/p/<token>/…`.
 * The token is a read capability, so it may never be baked into the bundle or
 * into `assets/config.json` — it is read back out of the URL the reviewer
 * opened, and every comment call is same-origin relative to that prefix.
 *
 * Any other hosting (local `adt/` export, file://, SCORM, Studio preview) has
 * no such prefix, so `detectPublishContext` answers `null` and the whole
 * comments feature stays inert.
 */

/** Mirrors `PublicationToken` in @adt/types (`/^[A-Za-z0-9_-]{22,64}$/`). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/

export interface PublishContext {
  token: string
  /** Absolute, same-origin, always trailing-slashed: `/p/<token>/`. */
  apiBase: string
}

export function detectPublishContext(pathname: string): PublishContext | null {
  const segments = pathname.split("/")
  if (segments.length < 3) return null
  if (segments[0] !== "" || segments[1] !== "p") return null

  const token = segments[2]
  if (!token || !TOKEN_PATTERN.test(token)) return null

  return { token, apiBase: `/p/${token}/` }
}

export function currentPublishContext(): PublishContext | null {
  if (typeof window === "undefined") return null
  return detectPublishContext(window.location.pathname)
}
