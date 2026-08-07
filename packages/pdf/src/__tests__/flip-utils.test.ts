import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import {
  applyOrientationTransformsToRasterImages,
  detectOrientationFromCurrentTransformationMatrix,
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

function createSixPixelPng(): Buffer {
  const png = new PNG({ width: 2, height: 3 });
  const colors = [
    [255, 0, 0], [0, 255, 0],
    [0, 0, 255], [255, 255, 0],
    [0, 255, 255], [255, 0, 255],
  ];
  colors.forEach((color, index) => {
    const offset = index * 4;
    png.data[offset] = color[0];
    png.data[offset + 1] = color[1];
    png.data[offset + 2] = color[2];
    png.data[offset + 3] = 255;
  });
  return PNG.sync.write(png);
}

function rgbaAt(buffer: Buffer, x: number, y: number): [number, number, number, number] {
  const { data, width } = PNG.sync.read(buffer);
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

describe("detectOrientationFromCurrentTransformationMatrix", () => {
  it("detects all right-angle rotations and reflections", () => {
    expect(detectOrientationFromCurrentTransformationMatrix([1, 0, 0, 1, 0, 0])).toBe("identity");
    expect(detectOrientationFromCurrentTransformationMatrix([-1, 0, 0, 1, 0, 0])).toBe("flip-horizontal");
    expect(detectOrientationFromCurrentTransformationMatrix([1, 0, 0, -1, 0, 0])).toBe("flip-vertical");
    expect(detectOrientationFromCurrentTransformationMatrix([-1, 0, 0, -1, 0, 0])).toBe("rotate-180");
    expect(detectOrientationFromCurrentTransformationMatrix([0, 1, -1, 0, 0, 0])).toBe("rotate-90-clockwise");
    expect(detectOrientationFromCurrentTransformationMatrix([0, -1, 1, 0, 0, 0])).toBe("rotate-90-counterclockwise");
    expect(detectOrientationFromCurrentTransformationMatrix([0, 1, 1, 0, 0, 0])).toBe("transpose");
    expect(detectOrientationFromCurrentTransformationMatrix([0, -1, -1, 0, 0, 0])).toBe("anti-transpose");
  });

  it("normalizes non-uniform scale and tolerates tiny axis residue", () => {
    expect(
      detectOrientationFromCurrentTransformationMatrix([
        0.000001,
        -459.851837,
        325.1875,
        -0.000001,
        130.14,
        674.28,
      ]),
    ).toBe("rotate-90-counterclockwise");
  });

  it("rejects arbitrary rotations, skew, and degenerate matrices", () => {
    const angle = Math.PI / 4;
    expect(
      detectOrientationFromCurrentTransformationMatrix([
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ]),
    ).toBeNull();
    expect(detectOrientationFromCurrentTransformationMatrix([1, 0.2, 0, 1, 0, 0])).toBeNull();
    expect(detectOrientationFromCurrentTransformationMatrix([0, 0, 0, 1, 0, 0])).toBeNull();
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

describe("applyOrientationTransformsToRasterImages", () => {
  it("applies the pre-stamped flip transform", () => {
    const sourceA = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const sourceB = createTwoPixelPng([0, 255, 0], [255, 255, 0]);
    const imageA = makeRasterImage("im001", sourceA, "digest-a");
    const imageB = makeRasterImage("im002", sourceB, "digest-b");
    imageA.orientationTransform = "flip-horizontal";
    imageB.orientationTransform = "identity";

    applyOrientationTransformsToRasterImages([imageA, imageB]);

    expect(imageA.buffer.equals(sourceA)).toBe(false);
    expect(imageB.buffer.equals(sourceB)).toBe(true);
  });

  it("bakes a quarter-turn into pixels and swaps dimensions", () => {
    const source = createSixPixelPng();
    const image = makeRasterImage("im001", source);
    image.width = 2;
    image.height = 3;
    image.orientationTransform = "rotate-90-counterclockwise";

    applyOrientationTransformsToRasterImages([image]);

    expect(image.width).toBe(3);
    expect(image.height).toBe(2);
    expect(rgbaAt(image.buffer, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(rgbaAt(image.buffer, 2, 0)).toEqual([255, 0, 255, 255]);
    expect(rgbaAt(image.buffer, 0, 1)).toEqual([255, 0, 0, 255]);
  });

  it("clears orientationTransform after applying, so an accidental second call is a no-op", () => {
    const source = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const image = makeRasterImage("im001", source);
    image.orientationTransform = "flip-horizontal";

    applyOrientationTransformsToRasterImages([image]);
    const afterFirstCall = Buffer.from(image.buffer);
    expect(image.orientationTransform).toBeUndefined();
    expect(afterFirstCall.equals(source)).toBe(false);

    // A caller re-invoking on the same array (without re-stamping
    // orientationTransform) must be a no-op, not a silent double-flip (which for
    // H+H would revert to the original, and for any other combination would
    // corrupt the image).
    applyOrientationTransformsToRasterImages([image]);

    expect(image.buffer.equals(afterFirstCall)).toBe(true);
  });

  it("does nothing when no flip transform was stamped", () => {
    const source = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const image = makeRasterImage("im001", source);

    applyOrientationTransformsToRasterImages([image]);

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
    image.orientationTransform = "rotate-180";

    applyOrientationTransformsToRasterImages([image]);

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
    badImage.orientationTransform = "flip-horizontal";

    const goodSource = createTwoPixelPng([255, 0, 0], [0, 0, 255]);
    const goodImage = makeRasterImage("im002", goodSource);
    goodImage.orientationTransform = "flip-horizontal";

    expect(() => applyOrientationTransformsToRasterImages([badImage, goodImage])).not.toThrow();

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
