import { PNG } from "pngjs";

export interface PngMetadata {
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
}

export function getPngMetadata(pngBuffer: Buffer): PngMetadata {
  const png = PNG.sync.read(pngBuffer);
  const totalPixels = png.width * png.height;
  const channels = png.data.length / totalPixels;
  return {
    width: png.width,
    height: png.height,
    channels,
    hasAlpha: channels === 4,
  };
}

export function decodePng(pngBuffer: Buffer): {
  data: Buffer;
  width: number;
  height: number;
} {
  const png = PNG.sync.read(pngBuffer);
  return { data: png.data as Buffer, width: png.width, height: png.height };
}

/**
 * Sample grayscale strips down the left and right edges of a page render.
 * Used by spread detection to compare a facing pair's shared gutter: a spread's
 * art is continuous across it. Samples a few pixels in from each edge to dodge
 * border artefacts, at `sampleCount` evenly spaced rows (top→bottom, 0..255).
 */
export function samplePageEdges(
  pngBuffer: Buffer,
  sampleCount = 48,
): { leftEdge: number[]; rightEdge: number[] } {
  const { data, width, height } = decodePng(pngBuffer);
  const channels = Math.max(1, Math.round(data.length / (width * height)));
  const gray = (x: number, y: number): number => {
    const i = (y * width + x) * channels;
    return channels >= 3 ? (data[i] + data[i + 1] + data[i + 2]) / 3 : data[i];
  };
  const leftX = Math.min(2, width - 1);
  const rightX = Math.max(0, width - 3);
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const y = Math.min(height - 1, Math.floor(((i + 0.5) * height) / sampleCount));
    leftEdge.push(gray(leftX, y));
    rightEdge.push(gray(rightX, y));
  }
  return { leftEdge, rightEdge };
}

/**
 * Stitch two PNG images side by side (left | right).
 * Height is the max of both; shorter image is top-aligned with transparent padding.
 */
export function stitchPngsHorizontally(left: Buffer, right: Buffer): Buffer {
  const l = decodePng(left);
  const r = decodePng(right);
  const width = l.width + r.width;
  const height = Math.max(l.height, r.height);
  const data = Buffer.alloc(width * height * 4); // RGBA, zero-filled (transparent)

  // Copy left image
  for (let y = 0; y < l.height; y++) {
    const srcOffset = y * l.width * 4;
    const dstOffset = y * width * 4;
    l.data.copy(data, dstOffset, srcOffset, srcOffset + l.width * 4);
  }

  // Copy right image
  for (let y = 0; y < r.height; y++) {
    const srcOffset = y * r.width * 4;
    const dstOffset = y * width * 4 + l.width * 4;
    r.data.copy(data, dstOffset, srcOffset, srcOffset + r.width * 4);
  }

  const png = new PNG({ width, height });
  png.data = data;
  return PNG.sync.write(png);
}

export function cropPng(
  pngBuffer: Buffer,
  region: { left: number; top: number; width: number; height: number }
): Buffer {
  const { data, width } = decodePng(pngBuffer);
  const { left, top, width: cropW, height: cropH } = region;
  const cropData = Buffer.alloc(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    const srcOffset = ((top + y) * width + left) * 4;
    const dstOffset = y * cropW * 4;
    data.copy(cropData, dstOffset, srcOffset, srcOffset + cropW * 4);
  }

  const png = new PNG({ width: cropW, height: cropH });
  png.data = cropData;
  return PNG.sync.write(png);
}
