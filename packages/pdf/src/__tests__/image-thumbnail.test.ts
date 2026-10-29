import { describe, it, expect } from "vitest";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { renderImageThumbnailJpeg } from "../image-thumbnail.js";

function solidPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let index = 0; index < width * height; index++) {
    png.data[index * 4] = 200;
    png.data[index * 4 + 1] = 40;
    png.data[index * 4 + 2] = 90;
    png.data[index * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

function solidJpeg(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4, 255);
  return Buffer.from(jpeg.encode({ data, width, height }, 90).data);
}

describe("renderImageThumbnailJpeg", () => {
  it("scales a PNG down to a JPEG of the requested width, keeping the aspect ratio", () => {
    const thumbnail = renderImageThumbnailJpeg(solidPng(800, 400), 200);
    expect(thumbnail.jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const decoded = jpeg.decode(thumbnail.jpeg);
    expect(decoded.width).toBe(200);
    expect(decoded.height).toBe(100);
    expect(thumbnail).toMatchObject({ width: 200, height: 100 });
    expect(decoded.data[0]).toBeGreaterThan(150);
  });

  it("re-encodes a JPEG source", () => {
    const decoded = jpeg.decode(renderImageThumbnailJpeg(solidJpeg(600, 900), 150).jpeg);
    expect(decoded.width).toBe(150);
    expect(decoded.height).toBe(225);
  });

  it("never upscales past the image's own width", () => {
    const thumbnail = renderImageThumbnailJpeg(solidPng(120, 60), 400);
    expect(jpeg.decode(thumbnail.jpeg).width).toBe(120);
  });

  it("rejects unknown formats and invalid widths", () => {
    expect(() => renderImageThumbnailJpeg(Buffer.from("not an image"), 100)).toThrow(TypeError);
    expect(() => renderImageThumbnailJpeg(solidPng(10, 10), 0)).toThrow(RangeError);
  });
});
