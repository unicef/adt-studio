/**
 * Reference-balanced replacements for two mupdf.js `Image` APIs that leak.
 *
 * In mupdf.js 1.27.0, `new Image(pointer)` takes its own reference
 * (`fz_keep_image`), but `destroy()` and the finalizer release only one. Two
 * APIs hand the constructor a pointer that already carries a reference, so
 * each call leaks one:
 *
 *  - `PDFDocument.loadImage()` passes the owned result of `pdf_load_image`.
 *  - `Image.getMask()` keeps the borrowed `image->mask` before constructing.
 *
 * The `loadImage` leak is what made extraction of image-heavy books crawl.
 * mupdf caches loaded images in its resource store, which is capped at 100 MB.
 * A leaked image can never be evicted, so after enough pages the pinned images
 * hold the store over its cap. From then on mupdf scavenges on every release,
 * and the ICC colour links it builds for colour conversion are evicted right
 * after each use. Every fill colour in the per-page SVG pass then rebuilds an
 * lcms2 transform. On a 94-page, 121 MB textbook, pages went from ~0.5 s to
 * 20–60 s each from page 24 on, and WASM memory kept growing.
 *
 * Each helper drops the extra reference, so the wrapper's own `destroy()` (or
 * finalizer) balances it. This depends on the exact upstream behaviour, so
 * `mupdf` is pinned to 1.27.0 in package.json. `mupdf-image-refs.test.ts`
 * fails if an upgrade changes either API, at which point these helpers must be
 * revisited: against a fixed mupdf.js they would release a reference twice.
 */
import mupdf, { type Image as MupdfImage, type PDFDocument, type PDFObject } from "mupdf"

/** `doc.loadImage(ref)` without the leaked reference. Destroy the result. */
export function loadPdfImage(doc: PDFDocument, ref: PDFObject): MupdfImage {
  const image = doc.loadImage(ref)
  mupdf.Image._drop(image.pointer)
  return image
}

/** `!!image.getMask()` without leaking a reference to the mask. */
export function imageHasMask(image: MupdfImage): boolean {
  const mask = image.getMask()
  if (!mask) return false
  mupdf.Image._drop(mask.pointer)
  mask.destroy()
  return true
}
