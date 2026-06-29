import type { ImageSegmentationOutput } from "@adt/types"
import { decodePng } from "@adt/pdf"
import jpeg from "jpeg-js"
import type { SegmentationPageInput } from "./image-segmentation.js"

interface RgbaImage {
  data: Uint8Array
  width: number
  height: number
}

export interface GeometricSegmentCandidate {
  label: string
  cropLeft: number
  cropTop: number
  cropRight: number
  cropBottom: number
  foregroundPixels: number
  boxArea: number
  isTopBand: boolean
}

/**
 * Detect likely independently cuttable regions using only pixel geometry.
 *
 * This is intentionally not a general-purpose image segmenter. The LLM remains
 * the semantic decision-maker for ordinary textbook art; this helper exists for
 * a narrow failure mode we saw with workbook/cut-out pages: the vision model can
 * correctly understand the page but still return too few bounding boxes. Those
 * pages have a very regular geometry: mostly white background, repeated cards
 * or dashed cut outlines, and large whitespace gutters, which classic image
 * processing can count more reliably than an LLM can produce coordinates.
 *
 * The function therefore returns only large, well-separated visual islands. Tiny
 * printer marks such as scissors icons, page numbers, and specks are filtered
 * out. A separate top band is preserved because some printable pages use a large
 * header strip as a meaningful cut/layout element even though it is thin.
 */
export function detectGeometricSegments(
  imageBase64: string,
  widthHint?: number,
  heightHint?: number,
): GeometricSegmentCandidate[] {
  let image: RgbaImage
  try {
    image = decodeImageToRgba(Buffer.from(stripDataUrlPrefix(imageBase64), "base64"))
  } catch {
    return []
  }

  if (widthHint && heightHint && (image.width !== widthHint || image.height !== heightHint)) {
    // Keep going with decoded dimensions. Storage dimensions occasionally come
    // from the PDF draw box while the encoded raster has its own pixel size.
  }

  const foreground = buildForegroundMask(image)
  const connected = connectNearbyForeground(foreground, image.width, image.height, connectionRadiusFor(image))
  const rawCandidates = connectedComponentCandidates(connected, image.width, image.height)
  const filtered = rawCandidates
    .filter((candidate) => isUsefulGeometricCandidate(candidate, image))
    .map((candidate) => padCandidate(candidate, image, Math.max(6, Math.round(Math.min(image.width, image.height) * 0.012))))

  return removeContainedCandidates(filtered)
    .sort(readingOrder)
    .map((candidate, index) => ({
      ...candidate,
      label: candidate.isTopBand ? "top band" : `geometric segment ${index + 1}`,
    }))
}

/**
 * Build a complete segmentation output from geometric candidates alone.
 *
 * This is the escape hatch for operational failures: invalid API key, provider
 * outage, or a vision model that refuses the request should not prevent the
 * deterministic cut-out detector from improving extract results. Images with
 * fewer than two geometric candidates are represented as "no segmentation" so
 * downstream code still receives a result row for every image it asked about.
 */
export function segmentPageImagesGeometrically(
  input: SegmentationPageInput,
  reason: string = "LLM segmentation unavailable; using deterministic geometric fallback.",
): ImageSegmentationOutput {
  return {
    results: input.images.map((image) => {
      const geometric = detectGeometricSegments(image.imageBase64, image.width, image.height)
      if (geometric.length < 2) {
        return {
          imageId: image.imageId,
          reasoning: `${reason} Geometry found ${geometric.length} large visual island(s), so this image was left unsegmented.`,
          needsSegmentation: false,
        }
      }

      return {
        imageId: image.imageId,
        reasoning: `${reason} Geometry detected ${geometric.length} large, separated visual islands.`,
        needsSegmentation: true,
        segments: geometric.map((candidate) => ({
          label: candidate.label,
          cropLeft: candidate.cropLeft,
          cropTop: candidate.cropTop,
          cropRight: candidate.cropRight,
          cropBottom: candidate.cropBottom,
        })),
      }
    }),
  }
}

/**
 * Apply the geometric fallback only when it is clearly correcting an
 * under-segmentation. If the LLM found the same number or more segments, we keep
 * the LLM result because it has better semantic judgment. If geometry sees more
 * large independent islands than the LLM returned, we replace that image's boxes
 * with the geometric boxes and make the reasoning explicit in the stored output.
 */
export function applyGeometricSegmentationFallback(
  llmOutput: ImageSegmentationOutput,
  images: SegmentationPageInput["images"],
): ImageSegmentationOutput {
  const byId = new Map(images.map((image) => [image.imageId, image]))

  return {
    results: llmOutput.results.map((result) => {
      const image = byId.get(result.imageId)
      if (!image) return result

      const geometric = detectGeometricSegments(image.imageBase64, image.width, image.height)
      const llmCount = result.needsSegmentation ? (result.segments?.length ?? 0) : 0
      if (geometric.length < 2 || geometric.length <= llmCount) return result

      return {
        imageId: result.imageId,
        reasoning:
          `${result.reasoning}\n\nGeometric fallback detected ${geometric.length} large, separated visual islands while the LLM returned ${llmCount}. Using geometric boxes to avoid under-segmenting likely cut-out/workbook elements.`,
        needsSegmentation: true,
        segments: geometric.map((candidate) => ({
          label: candidate.label,
          cropLeft: candidate.cropLeft,
          cropTop: candidate.cropTop,
          cropRight: candidate.cropRight,
          cropBottom: candidate.cropBottom,
        })),
      }
    }),
  }
}

/**
 * Decode PNG and JPEG buffers into the same RGBA shape. We reuse existing pure
 * JS/WASM dependencies already present in the repo instead of adding OpenCV or
 * any native image-processing dependency.
 */
function decodeImageToRgba(buffer: Buffer): RgbaImage {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const decoded = jpeg.decode(buffer, { useTArray: true })
    return { data: decoded.data, width: decoded.width, height: decoded.height }
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const decoded = decodePng(buffer)
    return { data: decoded.data, width: decoded.width, height: decoded.height }
  }

  throw new Error(
    `Unsupported image format (magic bytes: 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)})`
  )
}

/**
 * Convert pixels into foreground/background. Workbook cut-out pages are usually
 * white paper with colored cards, pale fills, dashed black cut-lines, and small
 * icons. A pixel counts as foreground when it is visible and not paper-white;
 * this deliberately keeps very pale pastel fills because they are often part of
 * letter/card artwork that the segment must include.
 */
function buildForegroundMask(image: RgbaImage): Uint8Array {
  const mask = new Uint8Array(image.width * image.height)
  for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
    const alpha = image.data[i + 3]
    if (alpha < 32) continue
    const red = image.data[i]
    const green = image.data[i + 1]
    const blue = image.data[i + 2]
    const paperWhite = red >= 246 && green >= 246 && blue >= 246
    if (!paperWhite) mask[p] = 1
  }
  return mask
}

/**
 * Choose a connection radius proportional to image size. The radius must be large
 * enough to bridge dashed cut-lines and the whitespace between a card frame and
 * the illustration inside it, but much smaller than the gutters between cards or
 * separate cut-out letters. Keeping it proportional makes the same code work on
 * thumbnails and full-page rasters.
 */
function connectionRadiusFor(image: RgbaImage): number {
  return Math.max(3, Math.min(14, Math.round(Math.min(image.width, image.height) * 0.018)))
}

/**
 * Connect nearby foreground pixels using separable dilation. The bounding boxes
 * are intentionally generous; the goal is to connect dashed outlines and related
 * inner artwork into one island, not to preserve exact edge contours. A
 * separable pass keeps the operation O(width*height*radius) instead of
 * O(width*height*radius^2).
 */
function connectNearbyForeground(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const horizontal = new Uint8Array(mask.length)
  const closed = new Uint8Array(mask.length)

  for (let y = 0; y < height; y++) {
    let count = 0
    for (let x = -radius; x <= radius; x++) {
      if (x >= 0 && x < width) count += mask[y * width + x]
    }
    for (let x = 0; x < width; x++) {
      if (count > 0) horizontal[y * width + x] = 1
      const leaving = x - radius
      const entering = x + radius + 1
      if (leaving >= 0) count -= mask[y * width + leaving]
      if (entering < width) count += mask[y * width + entering]
    }
  }

  for (let x = 0; x < width; x++) {
    let count = 0
    for (let y = -radius; y <= radius; y++) {
      if (y >= 0 && y < height) count += horizontal[y * width + x]
    }
    for (let y = 0; y < height; y++) {
      if (count > 0) closed[y * width + x] = 1
      const leaving = y - radius
      const entering = y + radius + 1
      if (leaving >= 0) count -= horizontal[leaving * width + x]
      if (entering < height) count += horizontal[entering * width + x]
    }
  }

  return closed
}

/**
 * Find connected foreground islands and summarize each island as a bounding box.
 * The mask has already had nearby foreground connected, so dashed borders and
 * inner drawings should usually be part of the same component. The returned
 * candidates are still raw: later filters remove tiny marks, full-page borders,
 * and components contained inside a larger card frame.
 */
function connectedComponentCandidates(mask: Uint8Array, width: number, height: number): GeometricSegmentCandidate[] {
  const labels = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  const candidates: GeometricSegmentCandidate[] = []

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue

    let head = 0
    let tail = 0
    queue[tail++] = start
    labels[start] = 1
    let minX = start % width
    let maxX = minX
    let minY = Math.floor(start / width)
    let maxY = minY
    let pixels = 0

    while (head < tail) {
      const idx = queue[head++]
      const x = idx % width
      const y = Math.floor(idx / width)
      pixels++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      if (x > 0) tail = enqueueIfForeground(mask, labels, queue, tail, idx - 1)
      if (x + 1 < width) tail = enqueueIfForeground(mask, labels, queue, tail, idx + 1)
      if (y > 0) tail = enqueueIfForeground(mask, labels, queue, tail, idx - width)
      if (y + 1 < height) tail = enqueueIfForeground(mask, labels, queue, tail, idx + width)
    }

    const cropLeft = minX
    const cropTop = minY
    const cropRight = maxX + 1
    const cropBottom = maxY + 1
    candidates.push({
      label: "geometric segment",
      cropLeft,
      cropTop,
      cropRight,
      cropBottom,
      foregroundPixels: pixels,
      boxArea: (cropRight - cropLeft) * (cropBottom - cropTop),
      isTopBand: isTopBandCandidate({ cropLeft, cropTop, cropRight, cropBottom }, width, height),
    })
  }

  return candidates
}

/** Mark an unvisited foreground neighbor as visited and append it to the BFS queue. */
function enqueueIfForeground(
  mask: Uint8Array,
  labels: Uint8Array,
  queue: Int32Array,
  tail: number,
  idx: number,
): number {
  if (mask[idx] === 0 || labels[idx] !== 0) return tail
  labels[idx] = 1
  queue[tail] = idx
  return tail + 1
}

/**
 * Decide whether a raw connected component is worth surfacing as a segment
 * candidate. The thresholds intentionally bias toward sizeable, separated
 * worksheet pieces. They also preserve the common "top strip" shape from
 * printable pages while dropping full-page borders and tiny marks.
 */
function isUsefulGeometricCandidate(candidate: GeometricSegmentCandidate, image: RgbaImage): boolean {
  const width = candidate.cropRight - candidate.cropLeft
  const height = candidate.cropBottom - candidate.cropTop
  const imageArea = image.width * image.height
  const minArea = Math.max(1200, imageArea * 0.003)
  const touchesLeft = candidate.cropLeft <= 1
  const touchesTop = candidate.cropTop <= 1
  const touchesRight = candidate.cropRight >= image.width - 1
  const touchesBottom = candidate.cropBottom >= image.height - 1
  const touchesEdges = [touchesLeft, touchesTop, touchesRight, touchesBottom].filter(Boolean).length

  if (candidate.isTopBand) return true
  if (touchesEdges >= 3) return false
  if (candidate.boxArea < minArea) return false
  if (width < 24 || height < 24) return false
  if (candidate.boxArea > imageArea * 0.72) return false

  return true
}

/** Identify a broad, shallow strip near the top of the image as its own candidate. */
function isTopBandCandidate(
  box: { cropLeft: number; cropTop: number; cropRight: number; cropBottom: number },
  width: number,
  height: number,
): boolean {
  const boxWidth = box.cropRight - box.cropLeft
  const boxHeight = box.cropBottom - box.cropTop
  return (
    box.cropTop <= height * 0.08 &&
    boxWidth >= width * 0.55 &&
    boxHeight >= height * 0.015 &&
    boxHeight <= height * 0.12
  )
}

/** Expand a candidate box by a small amount, clamped to image bounds. */
function padCandidate(candidate: GeometricSegmentCandidate, image: RgbaImage, padding: number): GeometricSegmentCandidate {
  const cropLeft = Math.max(0, candidate.cropLeft - padding)
  const cropTop = Math.max(0, candidate.cropTop - padding)
  const cropRight = Math.min(image.width, candidate.cropRight + padding)
  const cropBottom = Math.min(image.height, candidate.cropBottom + padding)
  return {
    ...candidate,
    cropLeft,
    cropTop,
    cropRight,
    cropBottom,
    boxArea: (cropRight - cropLeft) * (cropBottom - cropTop),
  }
}

/**
 * Remove candidates that are fully contained inside a larger candidate. This is
 * common with bordered cards: the frame creates a large component whose box
 * contains a smaller inner illustration component. The outer card is the desired
 * segment because cropping only the inner illustration would lose the cut line.
 */
function removeContainedCandidates(candidates: GeometricSegmentCandidate[]): GeometricSegmentCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.boxArea - a.boxArea)
  const kept: GeometricSegmentCandidate[] = []
  for (const candidate of sorted) {
    const contained = kept.some((larger) => containsCandidate(larger, candidate, 4))
    if (!contained) kept.push(candidate)
  }
  return kept
}

/** Return true when `outer` contains `inner` within a small tolerance. */
function containsCandidate(
  outer: GeometricSegmentCandidate,
  inner: GeometricSegmentCandidate,
  tolerance: number,
): boolean {
  return (
    outer.cropLeft <= inner.cropLeft + tolerance &&
    outer.cropTop <= inner.cropTop + tolerance &&
    outer.cropRight >= inner.cropRight - tolerance &&
    outer.cropBottom >= inner.cropBottom - tolerance &&
    outer.boxArea > inner.boxArea
  )
}

/** Sort candidates in human reading order with a loose row grouping. */
function readingOrder(a: GeometricSegmentCandidate, b: GeometricSegmentCandidate): number {
  const rowTolerance = Math.max(16, Math.min(a.cropBottom - a.cropTop, b.cropBottom - b.cropTop) * 0.35)
  if (Math.abs(a.cropTop - b.cropTop) > rowTolerance) return a.cropTop - b.cropTop
  return a.cropLeft - b.cropLeft
}

/** Accept raw base64 or data URLs; storage normally passes raw base64. */
function stripDataUrlPrefix(value: string): string {
  const comma = value.indexOf(",")
  return value.startsWith("data:") && comma !== -1 ? value.slice(comma + 1) : value
}
