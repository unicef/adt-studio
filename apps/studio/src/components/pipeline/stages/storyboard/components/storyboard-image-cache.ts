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
