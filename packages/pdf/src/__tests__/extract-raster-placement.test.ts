import { describe, expect, it } from "vitest";
import { _testing, type ExtractedImage } from "../extract.js";
import type { ImageStreamOp } from "../page-stream-recorder.js";

function makeRaster(
  imageId: string,
  pixelDigest?: string,
): ExtractedImage {
  return {
    imageId,
    pageId: "pg001",
    buffer: Buffer.from([0]),
    format: "png",
    width: 100,
    height: 100,
    hash: imageId,
    renderMethod: "raster",
    pixelDigest,
  };
}

function makeImageOp(
  seqno: number,
  contentDigest: string | undefined,
  ctm: number[],
): ImageStreamOp {
  return {
    kind: "image",
    seqno,
    bbox: { x0: 10, y0: 20, x1: 110, y1: 120 },
    nativeWidth: 100,
    nativeHeight: 100,
    currentTransformationMatrix: ctm,
    hasMask: false,
    activeClipBbox: null,
    activeClipPaths: [],
    blendMode: "Normal",
    alpha: 1,
    contentDigest,
  };
}

describe("stampRasterPlacementsFromOps", () => {
  it("disambiguates same-dimension collisions by digest and stamps matching flip", () => {
    const imageA = makeRaster("pg001_im001", "digest-a");
    const imageB = makeRaster("pg001_im002", "digest-b");
    const ops: ImageStreamOp[] = [
      makeImageOp(10, "digest-b", [1, 0, 0, -1, 0, 0]),
      makeImageOp(11, "digest-a", [-1, 0, 0, 1, 0, 0]),
    ];

    _testing.stampRasterPlacementsFromOps([imageA, imageB], ops);

    expect(imageA.streamSeqno).toBe(11);
    expect(imageB.streamSeqno).toBe(10);
    expect(imageA.flipTransform).toEqual({ flipHorizontal: true, flipVertical: false });
    expect(imageB.flipTransform).toEqual({ flipHorizontal: false, flipVertical: true });
  });

  it("falls back to stream order for same-dimension images without digests", () => {
    const first = makeRaster("pg001_im001");
    const second = makeRaster("pg001_im002");
    const ops: ImageStreamOp[] = [
      makeImageOp(20, undefined, [-1, 0, 0, 1, 0, 0]),
      makeImageOp(21, undefined, [1, 0, 0, 1, 0, 0]),
    ];

    _testing.stampRasterPlacementsFromOps([first, second], ops);

    expect(first.streamSeqno).toBe(20);
    expect(second.streamSeqno).toBe(21);
    expect(first.flipTransform).toEqual({ flipHorizontal: true, flipVertical: false });
    expect(second.flipTransform).toEqual({ flipHorizontal: false, flipVertical: false });
  });
});
