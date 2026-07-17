import type { ExtractedPage } from "@adt/pdf"
import type { LlmLogEntry } from "@adt/llm"
import type { RenderMethodValue } from "@adt/types"

export interface PageData {
  pageId: string
  pageNumber: number
  text: string
}

export interface ImageData {
  imageId: string
  width: number
  height: number
  /** How this image was produced: vector SVG render, page crop, or direct raster extraction */
  renderMethod?: RenderMethodValue
  /** Placement on the page in PDF points (top-left origin), when known. */
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface NodeDataRow {
  version: number
  data: unknown
}

export interface CroppedImageInput {
  imageId: string
  pageId: string
  version: number
  buffer: Buffer
  width: number
  height: number
}

export interface SegmentedImageInput {
  sourceImageId: string
  segmentIndex: number
  pageId: string
  version: number
  buffer: Buffer
  width: number
  height: number
  /**
   * Placement of this segment on the page in PDF points (top-left origin),
   * derived from the source image's placement. Persisted so recrop-from-page
   * can overlay the crop box where the segment was extracted.
   */
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface TranslatedImageInput {
  sourceImageId: string
  pageId: string
  languageCode: string
  buffer: Buffer
  width: number
  height: number
}

export interface SignLanguageVideoData {
  videoId: string
  sectionId: string | null
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface Storage {
  clearExtractedData(): void
  clearNodesByType(nodes: string[]): void
  putExtractedPage(page: ExtractedPage): void

  getPages(): PageData[]
  getPageImageBase64(pageId: string): string
  getImageBase64(imageId: string): string
  getImageDimensions(imageId: string): { width: number; height: number } | null
  /** Look up basic metadata for an image: its page id and book-relative path on disk. */
  getImageMeta(imageId: string): { pageId: string; relativePath: string } | null
  getPageImages(pageId: string): ImageData[]

  /** Write a cropped image to disk as {imageId}_crop_v{version}.png and register it in the DB with source="crop". */
  putCroppedImage(input: CroppedImageInput): void

  /** Write a segmented image to disk as {sourceImageId}_seg{NNN}_v{version}.png and register it in the DB with source="segment". */
  putSegmentedImage(input: SegmentedImageInput): void

  /** Write a localized image variant to disk as {sourceImageId}_tr_{langCode}.png and register it in the DB with source="translate". Returns the new image id. */
  putTranslatedImage(input: TranslatedImageInput): string

  /** Delete all translated image rows and their on-disk files. Optionally restrict to a set of source image ids and/or languages. */
  clearTranslatedImages(filter?: { sourceImageIds?: string[]; languageCodes?: string[] }): void

  putNodeData(node: string, itemId: string, data: unknown): number
  getLatestNodeData(node: string, itemId: string): NodeDataRow | null

  /** Mark a pipeline step as started (running). */
  markStepStarted(step: string): void
  /** Mark a pipeline step as completed successfully. Optionally persist a
   *  completion message (e.g. "Completed — 2 page(s) skipped"). */
  markStepCompleted(step: string, message?: string): void
  /** Mark a pipeline step as skipped. */
  markStepSkipped(step: string): void
  /** Record a step error. Can be called multiple times (last error wins). */
  recordStepError(step: string, error: string): void
  /** Update the progress message for a running step (e.g., "5/120"). */
  updateStepMessage(step: string, message: string): void
  /** Get all step run records. */
  getStepRuns(): Array<{ step: string; status: string; error: string | null; message: string | null }>
  /** Clear step run records for specific steps (used when clearing downstream data). */
  clearStepRuns(steps: string[]): void
  /** Delete step run records still marked 'running'. Used when a run is
   *  cancelled: in-flight steps return to idle rather than showing as errored. */
  clearRunningStepRuns(): void

  /** Get a compact fingerprint of all entity versions for cache invalidation. */
  getNodeVersionFingerprint(excludeNodes?: string[]): Array<{ node: string; itemId: string; version: number }>

  appendLlmLog(entry: LlmLogEntry): void

  /** Store a debug image (e.g. screenshot) by hash as a file under the book directory. */
  putDebugImage(hash: string, data: Buffer): void
  /** Clear all debug images (used when regenerating storyboard outputs). */
  clearDebugImages(): void

  /** Add a sign language video to the book. */
  putSignLanguageVideo(videoId: string, buffer: Buffer, originalName: string, mimeType: string): void
  /** List all sign language videos. */
  getSignLanguageVideos(): SignLanguageVideoData[]
  /** Assign a sign language video to a section (or null to unassign). */
  assignSignLanguageVideo(videoId: string, sectionId: string | null): void
  /** Delete a sign language video. */
  deleteSignLanguageVideo(videoId: string): void
  /** Delete all sign language videos. */
  deleteAllSignLanguageVideos(): void
  /** Get the file path for a sign language video (for serving). */
  getSignLanguageVideoPath(videoId: string): string | null

  close(): void
}
