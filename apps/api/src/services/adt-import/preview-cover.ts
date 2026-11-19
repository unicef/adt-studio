import { renderImageThumbnail } from "@adt/pdf"

/** Wide enough for the review's cover (shown about 96 px wide, 128 px on large
 * screens) on a 2x display. */
const PREVIEW_COVER_WIDTH = 320

/**
 * The archive's cover as a data URI for the import screens. Exports carry the
 * cover at full size (often several MB), which made the preview response slow
 * over a network for an image shown as a thumbnail. Falls back to the
 * original when the image can't be read.
 */
export function previewCoverDataUri(cover: { bytes: Uint8Array; mimeType: string } | null): string | null {
  if (!cover) return null
  const thumbnail = renderImageThumbnail(cover.bytes, cover.mimeType, { maxWidth: PREVIEW_COVER_WIDTH })
  return thumbnail
    ? `data:image/jpeg;base64,${thumbnail.toString("base64")}`
    : `data:${cover.mimeType};base64,${Buffer.from(cover.bytes).toString("base64")}`
}
