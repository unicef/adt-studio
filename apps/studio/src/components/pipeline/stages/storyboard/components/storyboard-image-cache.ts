const STORYBOARD_IMAGE_CACHE_POLICY = "revalidate-v1"

/**
 * Moves Storyboard image requests onto the revalidating cache policy.
 *
 * The query parameter is a one-time namespace change: browsers may still hold
 * the previous unversioned URL with a 24-hour freshness lifetime, so changing
 * response headers alone cannot repair those already-cached entries.
 */
export function applyStoryboardImageCachePolicy(html: string): string {
  return html.replace(
    /src=(["'])([^"']*\/api\/books\/[^/"']+\/images\/[^?"']+)(?:\?[^"']*)?\1/g,
    (_match, quote: string, imageUrl: string) =>
      `src=${quote}${imageUrl}?cache-policy=${STORYBOARD_IMAGE_CACHE_POLICY}${quote}`,
  )
}

/**
 * A book image link as the preview shows it: optionally on the desktop's local
 * API origin (`http://127.0.0.1:<port>`, a new port every launch), optionally
 * carrying the Storyboard cache-policy query. Both are display-only.
 */
const DISPLAY_BOOK_IMAGE_SRC =
  /src=(["'])(?:https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)?(\/api\/books\/[^/"']+\/images\/[^?"']+)(?:\?cache-policy=[^"']*)?\1/g

/**
 * Turns preview image links back into the stored form `/api/books/<label>/images/<id>`.
 *
 * The preview rewrites image links for display (current API origin + cache
 * policy). Edits that serialize the live preview DOM must undo that before the
 * HTML is saved, or the stored section points at one session's API port and
 * breaks after a restart. Also repairs sections saved with such links already.
 */
export function toStoredImageSources(html: string): string {
  return html.replace(
    DISPLAY_BOOK_IMAGE_SRC,
    (_match, quote: string, imagePath: string) => `src=${quote}${imagePath}${quote}`,
  )
}
