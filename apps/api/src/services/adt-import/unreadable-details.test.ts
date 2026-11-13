import { zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { readUnreadableAdtDetails } from "./unreadable-details.js"

const encode = (value: string) => new TextEncoder().encode(value)

describe("readUnreadableAdtDetails", () => {
  it("reads what it can and marks the rest null", () => {
    const zip = Buffer.from(zipSync({
      // Truncated JSON: neither the strict nor the lenient reader can parse it.
      "manifest.json": encode('{"book": {"title": "Broken'),
      "assets/config.json": encode(JSON.stringify({ title: "From the runtime config" })),
      "content/pages.json": encode(JSON.stringify([
        { section_id: "pg001_sec001", href: "pg001_sec001.html" },
        { section_id: "pg001_sec002", href: "pg001_sec002.html" },
        { section_id: "pg002_sec001", href: "pg002_sec001.html" },
      ])),
      "cover.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "images/a.png": new Uint8Array([1]),
      "images/b.jpg": new Uint8Array([1]),
    }))

    expect(readUnreadableAdtDetails(zip)).toEqual({
      title: "From the runtime config",
      coverBase64: "data:image/png;base64,iVBORw==",
      pageCount: 2,
      imageCount: 2,
      tocEntryCount: null,
      sourceLanguage: null,
      outputLanguages: null,
    })
  })

  it("returns null when the ZIP itself can't be opened", () => {
    expect(readUnreadableAdtDetails(Buffer.from("not a zip"))).toBeNull()
  })
})
