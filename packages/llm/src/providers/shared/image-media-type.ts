/**
 * Image parts reach the providers as base64 strings, sometimes wrapped in a
 * data URL. The CLI-backed providers need the media type (Claude's stream-json
 * blocks carry it; Codex wants a recognisable file extension) and the bare
 * payload.
 */

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,/i

const BASE64_MAGIC_MEDIA_TYPES: ReadonlyArray<[string, string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
]

const FILE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
}

/** An explicit data-URL media type wins; otherwise the base64 magic prefix decides, defaulting to PNG. */
export function detectImageMediaType(image: string): string {
  const dataUrl = DATA_URL_PATTERN.exec(image)
  if (dataUrl) return dataUrl[1]!.toLowerCase()

  for (const [prefix, mediaType] of BASE64_MAGIC_MEDIA_TYPES) {
    if (image.startsWith(prefix)) return mediaType
  }
  return "image/png"
}

/** The raw base64 payload with any data-URL prefix removed. */
export function stripDataUrl(image: string): string {
  return image.replace(DATA_URL_PATTERN, "")
}

/** File extension for a media type, so tools that sniff by name recognise the file. */
export function imageFileExtension(mediaType: string): string {
  return FILE_EXTENSIONS[mediaType.toLowerCase()] ?? "png"
}
