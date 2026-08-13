import { describe, expect, it } from "vitest"
import { strToU8, zipSync } from "fflate"

import { detectDistributionFormat, distributionFormatMessage } from "./distribution-format.js"

function makeZip(files: Record<string, string>): Buffer {
  const data: Record<string, Uint8Array> = {}
  for (const [name, contents] of Object.entries(files)) data[name] = strToU8(contents)
  return Buffer.from(zipSync(data))
}

describe("detectDistributionFormat", () => {
  it("detects an EPUB export by mimetype + container/OPF layout", () => {
    const zip = makeZip({
      mimetype: "application/epub+zip",
      "META-INF/container.xml": "<container/>",
      "OEBPS/content.opf": "<package/>",
      "OEBPS/content/pages.json": "[]",
    })
    expect(detectDistributionFormat(zip)).toBe("epub")
  })

  it("detects a PNLD export by its root OPF + resources tree", () => {
    const zip = makeZip({
      "content.opf": "<package/>",
      "resources/styles/tailwind_output.css": "",
      "content/pg001_sec001.html": "<html></html>",
    })
    expect(detectDistributionFormat(zip)).toBe("pnld")
  })

  it("detects a WebPub export by its Readium manifest", () => {
    const zip = makeZip({
      "manifest.json": JSON.stringify({
        "@context": "https://readium.org/webpub-manifest/context.jsonld",
        metadata: { conformsTo: "https://readium.org/webpub-manifest/profiles/epub" },
        readingOrder: [{ href: "index.html", type: "text/html" }],
      }),
      "content/pages.json": "[]",
    })
    expect(detectDistributionFormat(zip)).toBe("webpub")
  })

  it("returns null for a round-trip ADT bundle (editing-contract manifest)", () => {
    const zip = makeZip({
      "manifest.json": JSON.stringify({ formatVersion: 1, editingContract: { version: 2 } }),
      "index.html": "<html></html>",
      "content/pages.json": "[]",
      "imsmanifest.xml": "<manifest/>",
    })
    expect(detectDistributionFormat(zip)).toBeNull()
  })

  it("returns null for a legacy ADT bundle (no manifest, no distribution markers)", () => {
    const zip = makeZip({
      "index.html": "<html></html>",
      "content/pages.json": "[]",
      "content/i18n/en/texts.json": "{}",
      "imsmanifest.xml": "<manifest/>",
    })
    expect(detectDistributionFormat(zip)).toBeNull()
  })

  it("returns null for a project backup (db + pdf)", () => {
    const zip = makeZip({ "book.db": "SQLite format 3", "book.pdf": "%PDF-1.7" })
    expect(detectDistributionFormat(zip)).toBeNull()
  })

  it("returns null for non-zip data", () => {
    expect(detectDistributionFormat(Buffer.from("this is not a zip archive"))).toBeNull()
  })

  it("names the format in the user-facing message", () => {
    expect(distributionFormatMessage("epub")).toContain("EPUB")
    expect(distributionFormatMessage("pnld")).toContain("PNLD")
    expect(distributionFormatMessage("webpub")).toContain("WebPub")
    expect(distributionFormatMessage("epub")).toContain("read-only distribution format")
  })
})
