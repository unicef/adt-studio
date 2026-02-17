import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { zipSync } from "fflate"
import { parseBookLabel } from "@adt/types"
import { WebRenderingOutput as WebRenderingOutputSchema } from "@adt/types"
import type { WebRenderingOutput, BookMetadata } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  combineSections,
  buildImageMap,
  rewriteImageUrls,
  htmlToXhtml,
} from "@adt/pipeline"
import type { ExportResult } from "./export-service.js"

export async function exportBookEpub(
  label: string,
  booksDir: string,
  configPath?: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    // Verify storyboard is accepted
    const acceptance = storage.getLatestNodeData("storyboard-acceptance", "book")
    if (!acceptance) {
      throw new Error("Storyboard must be accepted before export")
    }

    // Read metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as BookMetadata | undefined
    const title = metadata?.title ?? safeLabel
    const authors = metadata?.authors ?? []
    const publisher = metadata?.publisher ?? ""
    const language = metadata?.language_code ?? "en"

    // Collect pages and images
    const pages = storage.getPages()
    const imageMap = buildImageMap(path.join(bookDir, "images"))
    const uuid = crypto.randomUUID()

    // Process each rendered page into XHTML chapter files
    const chapters: Array<{ id: string; filename: string; xhtml: string }> = []
    const referencedImages = new Set<string>()

    for (const page of pages) {
      const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
      if (!renderRow) continue

      const parsed = WebRenderingOutputSchema.safeParse(renderRow.data)
      if (!parsed.success) continue
      const rendering: WebRenderingOutput = parsed.data

      const { html: sectionHtml } = combineSections(rendering)
      const { html: rewrittenHtml, referencedImages: refs } = rewriteImageUrls(
        sectionHtml,
        safeLabel,
        imageMap,
      )
      for (const id of refs) referencedImages.add(id)

      // Rewrite image paths for EPUB structure (images/ → ../images/)
      const epubHtml = rewrittenHtml.replace(/src="images\//g, 'src="../images/')
      const bodyXhtml = htmlToXhtml(epubHtml)

      // Strip any <script> tags from the content
      const cleanXhtml = bodyXhtml.replace(/<script[\s\S]*?<\/script>/gi, "")

      const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeAttr(language)}" lang="${escapeAttr(language)}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/book.css" />
</head>
<body>
${cleanXhtml}
</body>
</html>`

      chapters.push({
        id: page.pageId,
        filename: `${page.pageId}.xhtml`,
        xhtml: chapterXhtml,
      })
    }

    // Handle cover image
    let coverImageFilename: string | null = null
    let coverMediaType: string | null = null
    if (metadata?.cover_page_number != null) {
      const coverPageId = pages.find(
        (p) => p.pageNumber === metadata.cover_page_number,
      )?.pageId
      if (coverPageId) {
        const coverImageId = `${coverPageId}_page`
        const fn = imageMap.get(coverImageId)
        if (fn) {
          coverImageFilename = fn
          coverMediaType = fn.endsWith(".png") ? "image/png" : "image/jpeg"
          referencedImages.add(coverImageId)
        }
      }
    }

    // Build ZIP entries
    const encoder = new TextEncoder()
    const zipFiles: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {}

    // mimetype MUST be first and uncompressed
    zipFiles["mimetype"] = [encoder.encode("application/epub+zip"), { level: 0 }]

    // META-INF/container.xml
    zipFiles["META-INF/container.xml"] = encoder.encode(CONTAINER_XML)

    // OEBPS/styles/book.css
    zipFiles["OEBPS/styles/book.css"] = encoder.encode(BOOK_CSS)

    // OEBPS/chapters/*.xhtml
    for (const ch of chapters) {
      zipFiles[`OEBPS/chapters/${ch.filename}`] = encoder.encode(ch.xhtml)
    }

    // OEBPS/images/*
    for (const imageId of referencedImages) {
      const filename = imageMap.get(imageId)
      if (filename) {
        const srcPath = path.join(bookDir, "images", filename)
        if (fs.existsSync(srcPath)) {
          zipFiles[`OEBPS/images/${filename}`] = new Uint8Array(fs.readFileSync(srcPath))
        }
      }
    }

    // OEBPS/content.opf
    zipFiles["OEBPS/content.opf"] = encoder.encode(
      buildContentOpf({
        uuid,
        title,
        authors,
        publisher,
        language,
        chapters,
        referencedImages,
        imageMap,
        coverImageFilename,
        coverMediaType,
      }),
    )

    // OEBPS/toc.xhtml
    zipFiles["OEBPS/toc.xhtml"] = encoder.encode(
      buildTocXhtml(title, language, chapters),
    )

    const zipBuffer = zipSync(zipFiles)

    return {
      zipBuffer,
      filename: `${safeLabel}.epub`,
    }
  } finally {
    storage.close()
  }
}

// ---------------------------------------------------------------------------
// EPUB XML templates
// ---------------------------------------------------------------------------

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`

const BOOK_CSS = `body {
  font-family: serif;
  margin: 1em;
  line-height: 1.6;
}
img {
  max-width: 100%;
  height: auto;
}
h1, h2, h3, h4, h5, h6 {
  margin-top: 1.2em;
  margin-bottom: 0.4em;
}
p {
  margin: 0.5em 0;
}`

function getImageMediaType(filename: string): string {
  if (filename.endsWith(".png")) return "image/png"
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg"
  if (filename.endsWith(".svg")) return "image/svg+xml"
  if (filename.endsWith(".webp")) return "image/webp"
  return "image/png"
}

function buildContentOpf(opts: {
  uuid: string
  title: string
  authors: string[]
  publisher: string
  language: string
  chapters: Array<{ id: string; filename: string }>
  referencedImages: Set<string>
  imageMap: Map<string, string>
  coverImageFilename: string | null
  coverMediaType: string | null
}): string {
  const {
    uuid, title, authors, publisher, language,
    chapters, referencedImages, imageMap,
    coverImageFilename, coverMediaType,
  } = opts

  const metaLines: string[] = [
    `    <dc:identifier id="uid">urn:uuid:${uuid}</dc:identifier>`,
    `    <dc:title>${escapeXml(title)}</dc:title>`,
    `    <dc:language>${escapeXml(language)}</dc:language>`,
    `    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>`,
  ]
  for (const author of authors) {
    metaLines.push(`    <dc:creator>${escapeXml(author)}</dc:creator>`)
  }
  if (publisher) {
    metaLines.push(`    <dc:publisher>${escapeXml(publisher)}</dc:publisher>`)
  }
  if (coverImageFilename) {
    metaLines.push(`    <meta name="cover" content="cover-image" />`)
  }

  const manifestItems: string[] = [
    `    <item id="nav" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav" />`,
    `    <item id="css" href="styles/book.css" media-type="text/css" />`,
  ]

  for (const ch of chapters) {
    manifestItems.push(
      `    <item id="${ch.id}" href="chapters/${ch.filename}" media-type="application/xhtml+xml" />`,
    )
  }

  for (const imageId of referencedImages) {
    const filename = imageMap.get(imageId)
    if (filename) {
      const mediaType = getImageMediaType(filename)
      const itemId = coverImageFilename === filename ? "cover-image" : `img-${imageId}`
      const props = coverImageFilename === filename ? ` properties="cover-image"` : ""
      manifestItems.push(
        `    <item id="${itemId}" href="images/${filename}" media-type="${mediaType}"${props} />`,
      )
    }
  }

  const spineItems = chapters.map(
    (ch) => `    <itemref idref="${ch.id}" />`,
  )

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metaLines.join("\n")}
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine>
${spineItems.join("\n")}
  </spine>
</package>`
}

function buildTocXhtml(
  title: string,
  language: string,
  chapters: Array<{ id: string; filename: string }>,
): string {
  const navItems = chapters.map(
    (ch, i) => `      <li><a href="chapters/${ch.filename}">Page ${i + 1}</a></li>`,
  )

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeAttr(language)}" lang="${escapeAttr(language)}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems.join("\n")}
    </ol>
  </nav>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// XML utilities
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
