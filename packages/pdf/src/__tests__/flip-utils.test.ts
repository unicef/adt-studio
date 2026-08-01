import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import {
  applyFlipsToRasterImages,
  detectFlipFromCurrentTransformationMatrix,
  flipImageBufferHorizontal,
  flipImageBufferVertical,
} from "../flip-utils.js";
import type { ExtractedImage } from "../extract.js";

function createTwoPixelPng(leftRgb: [number, number, number], rightRgb: [number, number, number]): Buffer {
  const png = new PNG({ width: 2, height: 1 });
  png.data[0] = leftRgb[0];
  png.data[1] = leftRgb[1];
  png.data[2] = leftRgb[2];
  png.data[3] = 255;
  png.data[4] = rightRgb[0];
  png.data[5] = rightRgb[1];
  png.data[6] = rightRgb[2];
  png.data[7] = 255;
  return PNG.sync.write(png);
}

function makeRasterImage(id: string, buffer: Buffer, pixelDigest?: string): ExtractedImage {
  return {
    imageId: id,
    pageId: "pg001",
    buffer,
    format: "png",
    width: 2,
    height: 1,
    hash: `encoded-${id}`,
    pixelDigest,
  };
}

function createFourPixelPng(): Buffer {
  const png = new PNG({ width: 2, height: 2 });
  // Top-left: red
  png.data[0] = 255;
  png.data[1] = 0;
  png.data[2] = 0;
  png.data[3] = 255;
  // Top-right: green
  png.data[4] = 0;
  png.data[5] = 255;
  png.data[6] = 0;
  png.data[7] = 255;
  // Bottom-left: blue
  png.data[8] = 0;
  png.data[9] = 0;
  png.data[10] = 255;
  png.data[11] = 255;
  // Bottom-right: yellow
  png.data[12] = 255;
  png.data[13] = 255;
  png.data[14] = 0;
  png.data[15] = 255;
  return PNG.sync.write(png);
}

function rgbaAt(buffer: Buffer, x: number, y: number): [number, number, number, number] {
  const { data, width } = PNG.sync.read(buffer);
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

describe("detectFlipFromCurrentTransformationMatrix", () => {
  it("detects horizontal and vertical flip from CTM signs", () => {
    expect(detectFlipFromCurrentTransformationMatrix([-1, 0, 0, 1, 0, 0])).toEqual({
      flipHorizontal: true,
      flipVertical: false,
    });
    expect(detectFlipFromCurrentTransformationMatrix([1, 0, 0, -1, 0, 0])).toEqual({
      flipHorizontal: false,
      flipVertical: true,
    });
    expect(detectFlipFromCurrentTransformationMatrix([-1, 0, 0, -1, 0, 0])).toEqual({
      flipHorizontal: true,
      flipVertical: true,
    });
    expect(detectFlipFromCurrentTransformationMatrix([1, 0, 0, 1, 0, 0])).toEqual({
      flipHorizontal: false,
      flipVertical: false,
    });
  });
});

describe("buffer flips", () => {
  it("flips PNG horizontally and vertically with expected pixel movement", () => {
    const original = createFourPixelPng();
    const flippedH = flipImageBufferHorizontal(original, "png");
    const flippedV = flipImageBufferVertical(original, "png");

    expect(rgbaAt(flippedH, 0, 0)).toEqual([0, 255, 0, 255]); // was top-right
    expect(rgbaAt(flippedH, 1, 0)).toEqual([255, 0, 0, 255]); // was top-left
    expect(rgbaAt(flippedV, 0, 0)).toEqual([0, 0, 255, 255]); // was bottom-left
    expect(rgbaAt(flippedV, 1, 1)).toEqual([0, 255, 0, 255]); // was top-right
  });

  it("round-trips PNG data after applying the same flip twice", () => {
    const original = createFourPixelPng();
    const twiceH = flipImageBufferHorizontal(flipImageBufferHorizontal(original, "png"), "png");
    const twiceV = flipImageBufferVertical(flipImageBufferVertical(original, "png"), "png");

    expect(twiceH.equals(original)).toBe(true);
    expect(twiceV.equals(original)).toBe(true);
  });

  it("uses JPEG decoded bytes with byteOffset preserved in vertical flip", () => {
    const backing = new Uint8Array([
      99, 98, 97, 96, // prefix noise outside view
      10, 11, 12, 13, // row 0
      20, 21, 22, 23, // row 1
    ]);
    const view = backing.subarray(4, 12);
    const decodeSpy = vi.spyOn(jpeg, "decode").mockReturnValue({
      width: 1,
      height: 2,
      data: view,
    } as unknown as ReturnType<typeof jpeg.decode>);
    const encodeSpy = vi.spyOn(jpeg, "encode").mockImplementation(({ data }) => ({
      data: Buffer.from(data as Uint8Array),
    }));

    const out = flipImageBufferVertical(Buffer.from([0]), "jpeg");

    expect(Array.from(out)).toEqual([20, 21, 22, 23, 10, 11, 12, 13]);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(encodeSpy).toHaveBeenCalledTimes(1);

    decodeSpy.mockRestore();
    encodeSpy.mockRestore();
  });
});

describe("applyFlipsToRasterImages", () => {
  it("applies the pre-stamped flip transform", () => {
    const sourceA = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const sourceB = createTwoPixelPng([0, 255, 0], [255, 255, 0]);
    const imageA = makeRasterImage("im001", sourceA, "digest-a");
    const imageB = makeRasterImage("im002", sourceB, "digest-b");
    imageA.flipTransform = { flipHorizontal: true, flipVertical: false };
    imageB.flipTransform = { flipHorizontal: false, flipVertical: false };

    applyFlipsToRasterImages([imageA, imageB]);

    expect(imageA.buffer.equals(sourceA)).toBe(false);
    expect(imageB.buffer.equals(sourceB)).toBe(true);
  });

  it("clears flipTransform after applying, so an accidental second call is a no-op", () => {
    const source = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const image = makeRasterImage("im001", source);
    image.flipTransform = { flipHorizontal: true, flipVertical: false };

    applyFlipsToRasterImages([image]);
    const afterFirstCall = Buffer.from(image.buffer);
    expect(image.flipTransform).toBeUndefined();
    expect(afterFirstCall.equals(source)).toBe(false);

    // A caller re-invoking on the same array (without re-stamping
    // flipTransform) must be a no-op, not a silent double-flip (which for
    // H+H would revert to the original, and for any other combination would
    // corrupt the image).
    applyFlipsToRasterImages([image]);

    expect(image.buffer.equals(afterFirstCall)).toBe(true);
  });

  it("does nothing when no flip transform was stamped", () => {
    const source = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const image = makeRasterImage("im001", source);

    applyFlipsToRasterImages([image]);

    expect(image.buffer.equals(source)).toBe(true);
  });

  it("decodes and encodes a JPEG exactly once for a 180° placement (both axes flipped)", () => {
    const decodeSpy = vi.spyOn(jpeg, "decode").mockReturnValue({
      width: 2,
      height: 1,
      data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
    } as unknown as ReturnType<typeof jpeg.decode>);
    const encodeSpy = vi.spyOn(jpeg, "encode").mockImplementation(({ data }) => ({
      data: Buffer.from(data as Uint8Array),
    }));

    const image = makeRasterImage("im001", Buffer.from([0xff, 0xd8]));
    image.format = "jpeg";
    image.flipTransform = { flipHorizontal: true, flipVertical: true };

    applyFlipsToRasterImages([image]);

    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(encodeSpy).toHaveBeenCalledTimes(1);

    decodeSpy.mockRestore();
    encodeSpy.mockRestore();
  });

  it("degrades to unflipped and keeps processing when jpeg.decode throws on a malformed image", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const malformedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]); // truncated/invalid JPEG
    const badImage = makeRasterImage("im001", malformedJpeg);
    badImage.format = "jpeg";
    badImage.flipTransform = { flipHorizontal: true, flipVertical: false };

    const goodSource = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const goodImage = makeRasterImage("im002", goodSource);
    goodImage.flipTransform = { flipHorizontal: true, flipVertical: false };

    expect(() => applyFlipsToRasterImages([badImage, goodImage])).not.toThrow();

    // Malformed image is left exactly as-is (original orientation kept).
    expect(badImage.buffer.equals(malformedJpeg)).toBe(true);
    // The next image in the batch is still processed normally.
    expect(goodImage.buffer.equals(goodSource)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("im001"),
      expect.anything()
    );

    warnSpy.mockRestore();
  });
});
