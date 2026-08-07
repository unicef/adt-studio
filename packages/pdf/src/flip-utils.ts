/**
 * Image orientation utilities.
 *
 * PDF image XObjects store raw pixels separately from the CTM used when the
 * image is painted. Extracted assets therefore need the CTM's discrete
 * orientation baked into their pixels so they match the rendered page.
 */

import { createHash } from "crypto";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { ExtractedImage, ImageFormat } from "./extract.js";
import { decodePng } from "./png-utils.js";

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/**
 * The eight axis-aligned symmetries of a rectangle. Rotation names describe
 * the pixel operation in the extractor's top-left/y-down image space.
 */
export type ImageOrientationTransform =
  | "identity"
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate-180"
  | "rotate-90-clockwise"
  | "rotate-90-counterclockwise"
  | "transpose"
  | "anti-transpose";

type AxisComponent = -1 | 0 | 1;
type OrientationMatrix = readonly [
  AxisComponent,
  AxisComponent,
  AxisComponent,
  AxisComponent,
];

/** Matrix maps source pixel coordinates to oriented output coordinates. */
const ORIENTATION_MATRICES: Record<ImageOrientationTransform, OrientationMatrix> = {
  identity: [1, 0, 0, 1],
  "flip-horizontal": [-1, 0, 0, 1],
  "flip-vertical": [1, 0, 0, -1],
  "rotate-180": [-1, 0, 0, -1],
  "rotate-90-clockwise": [0, -1, 1, 0],
  "rotate-90-counterclockwise": [0, 1, -1, 0],
  transpose: [0, 1, 1, 0],
  "anti-transpose": [0, -1, -1, 0],
};

const MATRIX_TO_ORIENTATION = new Map<string, ImageOrientationTransform>(
  Object.entries(ORIENTATION_MATRICES).map(([orientation, matrix]) => [
    matrix.join(","),
    orientation as ImageOrientationTransform,
  ]),
);

// InDesign and similar tools sometimes leave tiny floating-point residues in
// otherwise exact quarter-turn matrices. Accept those, but do not silently
// reinterpret a genuinely arbitrary rotation or skew as a flip.
const AXIS_SNAP_TOLERANCE = 1e-4;

function snapAxisComponent(value: number): AxisComponent | null {
  if (Math.abs(value) <= AXIS_SNAP_TOLERANCE) return 0;
  if (Math.abs(value - 1) <= AXIS_SNAP_TOLERANCE) return 1;
  if (Math.abs(value + 1) <= AXIS_SNAP_TOLERANCE) return -1;
  return null;
}

/**
 * Detect the discrete orientation encoded in a PDF image CTM.
 *
 * The two CTM basis vectors are normalized independently so non-uniform scale
 * does not affect orientation. Returns `null` for degenerate, skewed, or
 * arbitrary-angle matrices; those require general affine resampling rather
 * than a lossless right-angle pixel permutation.
 */
export function detectOrientationFromCurrentTransformationMatrix(
  currentTransformationMatrix: number[],
): ImageOrientationTransform | null {
  const [a, b, c, d] = currentTransformationMatrix;
  if (![a, b, c, d].every(Number.isFinite)) return null;

  const xLength = Math.hypot(a, b);
  const yLength = Math.hypot(c, d);
  if (xLength === 0 || yLength === 0) return null;

  const m00 = snapAxisComponent(a / xLength);
  const m01 = snapAxisComponent(c / yLength);
  const m10 = snapAxisComponent(b / xLength);
  const m11 = snapAxisComponent(d / yLength);
  if (m00 === null || m01 === null || m10 === null || m11 === null) return null;

  const matrix: OrientationMatrix = [m00, m01, m10, m11];
  return MATRIX_TO_ORIENTATION.get(matrix.join(",")) ?? null;
}

interface OrientedPixels {
  data: Buffer;
  width: number;
  height: number;
}

function orientRgbaPixels(
  data: Uint8Array,
  width: number,
  height: number,
  orientation: ImageOrientationTransform,
): OrientedPixels {
  const [m00, m01, m10, m11] = ORIENTATION_MATRICES[orientation];
  const swapsAxes = m00 === 0;
  const outputWidth = swapsAxes ? height : width;
  const outputHeight = swapsAxes ? width : height;
  const oriented = Buffer.alloc(outputWidth * outputHeight * 4);

  // Negative matrix terms produce negative raw coordinates. Translate the
  // transformed pixel lattice back to a zero-based output rectangle.
  const offsetX = (m00 < 0 ? width - 1 : 0) + (m01 < 0 ? height - 1 : 0);
  const offsetY = (m10 < 0 ? width - 1 : 0) + (m11 < 0 ? height - 1 : 0);

  for (let sourceY = 0; sourceY < height; sourceY++) {
    for (let sourceX = 0; sourceX < width; sourceX++) {
      const outputX = m00 * sourceX + m01 * sourceY + offsetX;
      const outputY = m10 * sourceX + m11 * sourceY + offsetY;
      const sourceIndex = (sourceY * width + sourceX) * 4;
      const outputIndex = (outputY * outputWidth + outputX) * 4;
      oriented.set(data.subarray(sourceIndex, sourceIndex + 4), outputIndex);
    }
  }

  return { data: oriented, width: outputWidth, height: outputHeight };
}

function orientImageBuffer(
  buffer: Buffer,
  format: ImageFormat,
  orientation: ImageOrientationTransform,
): { buffer: Buffer; width: number; height: number } {
  if (format === "jpeg") {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    const oriented = orientRgbaPixels(
      decoded.data,
      decoded.width,
      decoded.height,
      orientation,
    );
    const encoded = jpeg.encode(
      { data: oriented.data, width: oriented.width, height: oriented.height },
      90,
    );
    return {
      buffer: Buffer.from(encoded.data),
      width: oriented.width,
      height: oriented.height,
    };
  }

  const decoded = decodePng(buffer);
  const oriented = orientRgbaPixels(
    decoded.data,
    decoded.width,
    decoded.height,
    orientation,
  );
  const png = new PNG({ width: oriented.width, height: oriented.height });
  png.data = oriented.data;
  return {
    buffer: PNG.sync.write(png),
    width: oriented.width,
    height: oriented.height,
  };
}

/** Thin compatibility helpers used by focused pixel tests. */
export function flipImageBufferHorizontal(buffer: Buffer, format: ImageFormat): Buffer {
  return orientImageBuffer(buffer, format, "flip-horizontal").buffer;
}

export function flipImageBufferVertical(buffer: Buffer, format: ImageFormat): Buffer {
  return orientImageBuffer(buffer, format, "flip-vertical").buffer;
}

/**
 * Bake pre-stamped CTM orientations into extracted raster images in-place.
 * Quarter turns also update the stored native dimensions.
 *
 * JPEG transforms remain lossy because jpeg-js decodes to RGBA and re-encodes
 * at quality 90. A single transform always uses exactly one decode/encode pass.
 */
export function applyOrientationTransformsToRasterImages(
  images: ExtractedImage[],
): void {
  for (const image of images) {
    const orientation = image.orientationTransform;
    if (!orientation || orientation === "identity") {
      image.orientationTransform = undefined;
      continue;
    }

    try {
      const oriented = orientImageBuffer(image.buffer, image.format, orientation);
      image.buffer = oriented.buffer;
      image.width = oriented.width;
      image.height = oriented.height;
      image.hash = hashBuffer(oriented.buffer);
    } catch (err) {
      // Preserve the previous availability behavior: one unusual JPEG must not
      // abort the whole page/book. The warning makes the degraded orientation
      // discoverable in server logs.
      console.warn(
        `[pdf] orientation transform failed for ${image.imageId}, keeping original pixels:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      // Prevent an accidental second call from applying the transform twice.
      image.orientationTransform = undefined;
    }
  }
}
