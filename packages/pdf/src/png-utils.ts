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
