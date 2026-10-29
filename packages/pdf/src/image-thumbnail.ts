import mupdf from "mupdf";

export interface ImageThumbnail {
  jpeg: Buffer;
  width: number;
  height: number;
}

function imageMimeType(buffer: Buffer): string {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  throw new TypeError("Unsupported image format");
}

/**
 * Decode a PNG/JPEG/WebP/GIF buffer with mupdf (pure WASM) and re-encode it as a
 * JPEG no wider than `width`. Never upscales.
 */
export function renderImageThumbnailJpeg(buffer: Buffer, width: number, quality = 80): ImageThumbnail {
  if (!Number.isFinite(width) || width < 1) throw new RangeError(`Invalid thumbnail width ${width}`);
  const mimeType = imageMimeType(buffer);
  const source = new mupdf.Image(buffer);
  const naturalWidth = source.getWidth();
  source.destroy();
  const doc = mupdf.Document.openDocument(buffer, mimeType);
  try {
    const page = doc.loadPage(0);
    try {
      const bounds = page.getBounds();
      const target = Math.min(width, naturalWidth);
      const scale = target / (bounds[2] - bounds[0]);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
      try {
        return { jpeg: Buffer.from(pixmap.asJPEG(quality, false)), width: pixmap.getWidth(), height: pixmap.getHeight() };
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}
