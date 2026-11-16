import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { projectImportedHtmlSection } from "@adt/pipeline"
import { createBookStorage, openBookDb } from "@adt/storage"
import { ImageClassificationOutput } from "@adt/types"

import { readAdtBundle } from "../bundle-reader.js"
import { pageIdFromSection } from "../catalog.js"
import { importedImageDimensions } from "./image-dimensions.js"
import { importedGlossaryImageId } from "./features.js"

/** The HTML `src` is the image the page shows, so a replacement that keeps the
 * element's data-id wins over a stale file still named after that id. */
function resolveImportedImage(
  files: Record<string, Uint8Array>,
  root: string,
  href: string,
  imageId: string,
  src: string,
): { archivePath: string; bytes: Uint8Array; extension: string } | null {
  const supported = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"])
  // An image embedded in the HTML as a data: URI becomes a real book image.
  const inline = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,([a-z0-9+/=\s]+)$/i.exec(src.trim())
  if (inline) {
    const extension = inline[1].toLowerCase().replace("svg+xml", "svg").replace("jpeg", "jpg")
    const bytes = new Uint8Array(Buffer.from(inline[2].replace(/\s+/g, ""), "base64"))
    if (bytes.length > 0) return { archivePath: `${href}#${imageId}`, bytes, extension }
  }
  const candidates: string[] = []
  if (src && !/^(?:data:|https?:|\/)/i.test(src)) {
    let decoded = src.split(/[?#]/, 1)[0]
    try { decoded = decodeURIComponent(decoded) } catch { /* keep the encoded form */ }
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(href), decoded))
    if (relative && relative !== ".." && !relative.startsWith("../")) {
      candidates.push(`${root}${relative}`)
    }
  }
  for (const extension of supported) candidates.push(`${root}images/${imageId}.${extension}`)
  candidates.push(...Object.keys(files).filter((archivePath) => {
    if (!archivePath.startsWith(root)) return false
    const basename = path.posix.basename(archivePath)
    return basename.slice(0, basename.lastIndexOf(".")) === imageId
  }))

  for (const archivePath of candidates) {
    const bytes = files[archivePath]
    if (!bytes) continue
    const extension = path.posix.extname(archivePath).slice(1).toLowerCase()
    if (supported.has(extension)) return { archivePath, bytes, extension }
  }
  return null
}


export function seedImportedImages(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  files: Record<string, Uint8Array>,
): void {
  const bookDir = path.join(path.resolve(booksDir), label)
  const imagesDir = path.join(bookDir, "images")
  fs.mkdirSync(imagesDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  const firstImageByPage = new Map<string, { bytes: Uint8Array; extension: string }>()
  const imageIdsByPage = new Map<string, string[]>()
  try {
    bundle.pages.forEach((page, index) => {
      const pageId = pageIdFromSection(page.section_id, index)
      if (!pageId) return
      const projection = projectImportedHtmlSection(
        bundle.pageHtml[page.href] ?? "",
        page.section_id,
        undefined,
        { repairLegacyIds: bundle.sourceFormat === "legacy-studio-export" },
      )
      for (const image of projection.images) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(image.imageId)) continue
        const resolved = resolveImportedImage(
          files,
          bundle.root,
          page.href,
          image.imageId,
          image.src,
        )
        if (!resolved) continue
        const hash = createHash("sha256").update(resolved.bytes).digest("hex")
        const filename = `${image.imageId}.${resolved.extension}`
        fs.writeFileSync(path.join(imagesDir, filename), resolved.bytes)
        const dimensions = importedImageDimensions(resolved.bytes, resolved.extension)
        db.run(
          `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (image_id) DO UPDATE SET
             page_id = excluded.page_id,
             path = excluded.path,
             hash = excluded.hash,
             width = excluded.width,
             height = excluded.height,
             source = excluded.source`,
          [image.imageId, pageId, `images/${filename}`, hash, dimensions.width, dimensions.height, "extract"],
        )
        imageIdsByPage.set(pageId, [...(imageIdsByPage.get(pageId) ?? []), image.imageId])
        if (!firstImageByPage.has(pageId)) {
          firstImageByPage.set(pageId, { bytes: resolved.bytes, extension: resolved.extension })
        }
      }
    })

    const logicalPages = bundle.pages
      .map((page, index) => pageIdFromSection(page.section_id, index))
      .filter((pageId): pageId is string => pageId !== null)
    const firstPageId = logicalPages[0]

    // Glossary pictures no page shows are still book images: register them so
    // the glossary keeps its picture (images need a page; the first one hosts).
    const pageImageIds = new Set([...imageIdsByPage.values()].flat())
    const sourceGlossary = bundle.glossaries[bundle.manifest.languages.source] ?? {}
    for (const entry of Object.values(sourceGlossary)) {
      const imageId = importedGlossaryImageId(bundle, files, entry.image)
      if (!imageId || !firstPageId || pageImageIds.has(imageId)) continue
      const bytes = files[`${bundle.root}${entry.image}`]
      const extension = path.posix.extname(entry.image!).slice(1).toLowerCase()
      const filename = `${imageId}.${extension}`
      fs.writeFileSync(path.join(imagesDir, filename), bytes)
      const dimensions = importedImageDimensions(bytes, extension)
      db.run(
        `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (image_id) DO NOTHING`,
        [imageId, firstPageId, `images/${filename}`, createHash("sha256").update(bytes).digest("hex"), dimensions.width, dimensions.height, "extract"],
      )
      pageImageIds.add(imageId)
    }
    if (firstPageId && bundle.cover) {
      const extension = bundle.cover.mimeType === "image/png"
        ? "png"
        : bundle.cover.mimeType === "image/webp" ? "webp" : "jpg"
      firstImageByPage.set(firstPageId, { bytes: bundle.cover.bytes, extension })
    }
    for (const [pageId, image] of firstImageByPage) {
      const hash = createHash("sha256").update(image.bytes).digest("hex")
      const filename = `${pageId}_page.${image.extension}`
      fs.writeFileSync(path.join(imagesDir, filename), image.bytes)
      const dimensions = importedImageDimensions(image.bytes, image.extension)
      db.run(
        `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (image_id) DO UPDATE SET
           page_id = excluded.page_id,
           path = excluded.path,
           hash = excluded.hash,
           width = excluded.width,
           height = excluded.height,
           source = excluded.source`,
        [`${pageId}_page`, pageId, `images/${filename}`, hash, dimensions.width, dimensions.height, "extract"],
      )
    }
  } finally {
    db.close()
  }

  // Every consumer that asks "which images does this page have?" — the page
  // summary's `imageCount`, and with it the Captions gallery — reads the
  // `image-filtering` classification, not the images table. Without one an
  // imported book reports zero images everywhere and Captions renders "No
  // images in this book" even though the captions themselves were recovered.
  // Nothing here can justify pruning: the imported HTML already draws these
  // images, so they are all in use. The synthetic `_page` render is the one
  // exception, pruned exactly as the native pipeline prunes it.
  const storage = createBookStorage(label, booksDir)
  try {
    for (const [pageId, imageIds] of imageIdsByPage) {
      // Only when the page has no classification yet: on a re-projection the
      // existing one carries the user's own pruning decisions.
      if (storage.getLatestNodeData("image-filtering", pageId)) continue
      storage.putNodeData("image-filtering", pageId, ImageClassificationOutput.parse({
        images: [
          ...imageIds.map((imageId) => ({
            imageId,
            isPruned: false,
            reason: "Recovered from the exported ADT HTML, which already draws this image.",
          })),
          {
            imageId: `${pageId}_page`,
            isPruned: true,
            reason: "Whole-page render: keeping it would draw the page twice.",
          },
        ],
      }))
    }
    if (imageIdsByPage.size > 0) {
      storage.markStepCompleted("image-filtering", "Recovered from exported ADT HTML")
    }
  } finally {
    storage.close()
  }
}
