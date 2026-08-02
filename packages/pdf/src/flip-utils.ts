/**
 * Image Flip Transform Utilities
 *
 * Detects and applies current transformation matrix (CTM) based flip transformations 
 * to raster images extracted from PDFs. Handles both JPEG and PNG formats.
 */

import { createHash } from "crypto";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { decodePng } from "./png-utils.js";
import type { ExtractedImage } from "./extract.js";

/**
 * Hash a buffer to a 16-character hex string.
 * Avoids circular dependency by defining locally instead of importing from extract.
 */
function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/**
 * Detect if image needs horizontal/vertical flip based on current transformation matrix.
 * Negative X scale (a < 0) = horizontal flip; negative Y scale (d < 0) = vertical flip.
 * Scope: axis-aligned flips only. This intentionally ignores b/c (rotation/skew)
 * terms from the CTM; suitable for current storybook inputs, but not a full
 * affine-orientation solver for arbitrary rotations.
 */
export interface ImageFlipTransform {
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export function detectFlipFromCurrentTransformationMatrix(currentTransformationMatrix: number[]): ImageFlipTransform {
  const [a, , , d] = currentTransformationMatrix; // [a, b, c, d, e, f]
  return {
    flipHorizontal: a < 0, // Negative X scale
    flipVertical: d < 0,   // Negative Y scale
  };
}

/**
 * Flip an image buffer along one or both axes in a single decode/encode pass.
 * Handles both JPEG and PNG formats.
 *
 * Decoding once and applying both axes together (rather than chaining two
 * single-axis flips) matters most for JPEG: each decode+encode round-trip is
 * lossy (generational loss) and CPU-costly, so a 180° placement — both flags
 * set, the common case for upside-down scans — must not pay that cost twice.
 */
function flipImageBuffer(
  buffer: Buffer,
  format: string,
  { flipHorizontal, flipVertical }: ImageFlipTransform
): Buffer {
  if (!flipHorizontal && !flipVertical) return buffer;

  if (format === "jpeg") {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    const { width, height } = decoded;
    const flipped = Buffer.alloc(decoded.data.length);

    for (let y = 0; y < height; y++) {
      const srcY = flipVertical ? height - 1 - y : y;
      for (let x = 0; x < width; x++) {
        const srcX = flipHorizontal ? width - 1 - x : x;
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;
        flipped[dstIdx] = decoded.data[srcIdx];
        flipped[dstIdx + 1] = decoded.data[srcIdx + 1];
        flipped[dstIdx + 2] = decoded.data[srcIdx + 2];
        flipped[dstIdx + 3] = decoded.data[srcIdx + 3];
      }
    }

    const encoded = jpeg.encode(
      { data: flipped, width, height },
      90 // Maintain quality
    );
    return Buffer.from(encoded.data);
  }

  if (format === "png") {
    const { data, width, height } = decodePng(buffer);
    const flipped = Buffer.alloc(data.length);

    for (let y = 0; y < height; y++) {
      const srcY = flipVertical ? height - 1 - y : y;
      for (let x = 0; x < width; x++) {
        const srcX = flipHorizontal ? width - 1 - x : x;
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;
        flipped[dstIdx] = data[srcIdx];
        flipped[dstIdx + 1] = data[srcIdx + 1];
        flipped[dstIdx + 2] = data[srcIdx + 2];
        flipped[dstIdx + 3] = data[srcIdx + 3];
      }
    }

    const png = new PNG({ width, height });
    png.data = flipped;
    return PNG.sync.write(png);
  }

  return buffer; // Unknown format
}

/**
 * Flip image buffer horizontally (left-right mirror).
 *
 * JPEG tradeoff: this path decodes to RGBA, flips pixels, then re-encodes at
 * quality 90. That is lossy for already-compressed JPEGs (generational loss),
 * even though geometric flip can be represented losslessly in JPEG.
 * Chosen intentionally for now to keep a pure JS/TS dependency-light path.
 */
export function flipImageBufferHorizontal(buffer: Buffer, format: string): Buffer {
  return flipImageBuffer(buffer, format, { flipHorizontal: true, flipVertical: false });
}

/**
 * Flip image buffer vertically (top-bottom mirror).
 *
 * JPEG tradeoff: this path decodes to RGBA, flips pixels, then re-encodes at
 * quality 90. That is lossy for already-compressed JPEGs (generational loss).
 */
export function flipImageBufferVertical(buffer: Buffer, format: string): Buffer {
  return flipImageBuffer(buffer, format, { flipHorizontal: false, flipVertical: true });
}

/**
 * Apply CTM-based flip transforms to raster images.
 * Updates image buffers and hashes in-place.
 *
 * Flip direction is pre-stamped per image by `stampRasterPlacementsFromOps`
 * during the consuming op->image match pass.
 */
export function applyFlipsToRasterImages(
  images: ExtractedImage[]
): void {
  if (images.length === 0) return;

  for (const image of images) {
    const { flipHorizontal, flipVertical } = image.flipTransform ?? {
      flipHorizontal: false,
      flipVertical: false,
    };
    if (!flipHorizontal && !flipVertical) continue;

    try {
      // Single decode/encode pass for both axes — avoids double generational
      // loss + double CPU cost on 180° placements (both flags set).
      const flippedBuf = flipImageBuffer(image.buffer, image.format, { flipHorizontal, flipVertical });

      // Update the image with the flipped buffer and recalculate hash
      image.buffer = flippedBuf;
      image.hash = hashBuffer(flippedBuf);
      // Clear the transform so a second call over the same array (not done
      // today, but not guaranteed by any caller) is a no-op instead of
      // silently double-flipping (H+H reverts to original; any other
      // combination corrupts the image).
      image.flipTransform = undefined;
    } catch (err) {
      // Leave the image unflipped rather than failing the whole page/book.
      // jpeg-js is stricter than mupdf (no arithmetic coding, 12-bit, or
      // truncated streams, plus its own maxMemoryUsageInMB guard) and, via
      // the canRawExtract fast path, is the first thing to ever decode these
      // raw DCTDecode bytes.
      console.warn(
        `[pdf] flip failed for ${image.imageId}, keeping original orientation:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
