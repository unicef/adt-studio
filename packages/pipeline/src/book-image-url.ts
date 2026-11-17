/** Stored book image URLs are portable references to the current book's image
 * catalog, as in Storyboard. Rebase only local API references, never external
 * URLs, and never modify the stored HTML/activity or the source book. */
export function currentBookImageSrc(src: string, label: string): string {
  return src.replace(/^\/api\/books\/[^/]+\/images\//, `/api/books/${encodeURIComponent(label)}/images/`)
}
