import { describe, it, expect } from "vitest"
import zlib from "node:zlib"
import { detectFontFormat, parseFontMetadata } from "../font-metadata.js"

function utf16be(s: string): Buffer {
  const out = Buffer.alloc(s.length * 2)
  for (let i = 0; i < s.length; i++) out.writeUInt16BE(s.charCodeAt(i), i * 2)
  return out
}

function buildNameTable(names: Record<number, string>): Buffer {
  const entries = Object.entries(names).map(([id, value]) => ({
    nameId: Number(id),
    bytes: utf16be(value),
  }))
  const count = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16BE(0, 0)
  header.writeUInt16BE(count, 2)
  header.writeUInt16BE(6 + count * 12, 4)

  const records: Buffer[] = []
  const strings: Buffer[] = []
  let offset = 0
  for (const { nameId, bytes } of entries) {
    const rec = Buffer.alloc(12)
    rec.writeUInt16BE(3, 0)
    rec.writeUInt16BE(1, 2)
    rec.writeUInt16BE(0x409, 4)
    rec.writeUInt16BE(nameId, 6)
    rec.writeUInt16BE(bytes.length, 8)
    rec.writeUInt16BE(offset, 10)
    records.push(rec)
    strings.push(bytes)
    offset += bytes.length
  }
  return Buffer.concat([header, ...records, ...strings])
}

function buildOs2Table(weight: number, italic: boolean, fsType = 0): Buffer {
  const table = Buffer.alloc(78)
  table.writeUInt16BE(4, 0)
  table.writeUInt16BE(weight, 4)
  table.writeUInt16BE(fsType, 8)
  table.writeUInt16BE(italic ? 0x01 : 0x40, 62)
  return table
}

function buildSfnt(tables: Record<string, Buffer>, version = 0x00010000): Buffer {
  const names = Object.keys(tables)
  const header = Buffer.alloc(12)
  header.writeUInt32BE(version, 0)
  header.writeUInt16BE(names.length, 4)

  let dataOffset = 12 + names.length * 16
  const records: Buffer[] = []
  const data: Buffer[] = []
  for (const name of names) {
    const table = tables[name]
    const rec = Buffer.alloc(16)
    rec.write(name.padEnd(4), 0, 4, "latin1")
    rec.writeUInt32BE(dataOffset, 8)
    rec.writeUInt32BE(table.length, 12)
    records.push(rec)
    data.push(table)
    dataOffset += table.length
  }
  return Buffer.concat([header, ...records, ...data])
}

function buildWoff(tables: Record<string, Buffer>): Buffer {
  const names = Object.keys(tables)
  const header = Buffer.alloc(44)
  header.writeUInt32BE(0x774f4646, 0)
  header.writeUInt32BE(0x00010000, 4)
  header.writeUInt16BE(names.length, 12)

  let dataOffset = 44 + names.length * 20
  const records: Buffer[] = []
  const data: Buffer[] = []
  for (const name of names) {
    const orig = tables[name]
    const comp = zlib.deflateSync(orig)
    const stored = comp.length < orig.length ? comp : orig
    const rec = Buffer.alloc(20)
    rec.write(name.padEnd(4), 0, 4, "latin1")
    rec.writeUInt32BE(dataOffset, 4)
    rec.writeUInt32BE(stored.length, 8)
    rec.writeUInt32BE(orig.length, 12)
    records.push(rec)
    data.push(stored)
    dataOffset += stored.length
  }
  return Buffer.concat([header, ...records, ...data])
}

describe("detectFontFormat", () => {
  it("recognizes ttf / otf / woff / woff2 magic bytes", () => {
    expect(detectFontFormat(buildSfnt({}))).toBe("truetype")
    expect(detectFontFormat(buildSfnt({}, 0x4f54544f))).toBe("opentype")
    expect(detectFontFormat(buildWoff({}))).toBe("woff")
    expect(detectFontFormat(Buffer.from("wOF2abcd", "latin1"))).toBe("woff2")
  })

  it("rejects non-font data", () => {
    expect(detectFontFormat(Buffer.from("%PDF-1.4"))).toBeNull()
    expect(detectFontFormat(Buffer.from("hello world"))).toBeNull()
    expect(detectFontFormat(Buffer.alloc(0))).toBeNull()
  })
})

describe("parseFontMetadata", () => {
  it("reads family, subfamily, weight and italic from a TTF", () => {
    const ttf = buildSfnt({
      name: buildNameTable({ 1: "Minha Fonte", 2: "Bold Italic" }),
      "OS/2": buildOs2Table(700, true),
    })
    const meta = parseFontMetadata(ttf)
    expect(meta).toMatchObject({
      format: "truetype",
      family: "Minha Fonte",
      subfamily: "Bold Italic",
      weight: 700,
      italic: true,
    })
  })

  it("prefers the typographic family (name ID 16)", () => {
    const ttf = buildSfnt({
      name: buildNameTable({ 1: "Minha Fonte Bold", 16: "Minha Fonte" }),
    })
    expect(parseFontMetadata(ttf)?.family).toBe("Minha Fonte")
  })

  it("infers weight from the subfamily when OS/2 is missing", () => {
    const ttf = buildSfnt({
      name: buildNameTable({ 1: "Fonte", 2: "SemiBold" }),
    })
    const meta = parseFontMetadata(ttf)
    expect(meta?.weight).toBe(600)
    expect(meta?.italic).toBe(false)
  })

  it("parses WOFF (zlib-compressed tables)", () => {
    const woff = buildWoff({
      name: buildNameTable({ 1: "Fonte Woff" }),
      "OS/2": buildOs2Table(300, false),
    })
    const meta = parseFontMetadata(woff)
    expect(meta).toMatchObject({ format: "woff", family: "Fonte Woff", weight: 300 })
  })

  it("returns format-only metadata for WOFF2", () => {
    const meta = parseFontMetadata(Buffer.from("wOF2\x00\x01\x00\x00rest", "latin1"))
    expect(meta).toMatchObject({ format: "woff2", family: null, weight: 400 })
  })

  it("returns null for non-fonts", () => {
    expect(parseFontMetadata(Buffer.from("not a font at all"))).toBeNull()
  })

  it("survives a truncated/malformed name table", () => {
    const ttf = buildSfnt({ name: Buffer.from([0, 0, 0]) })
    const meta = parseFontMetadata(ttf)
    expect(meta?.family).toBeNull()
  })

  it("extracts license description and url from name IDs 13/14", () => {
    const ttf = buildSfnt({
      name: buildNameTable({
        1: "Fonte",
        13: "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
        14: "https://scripts.sil.org/OFL",
      }),
    })
    const meta = parseFontMetadata(ttf)
    expect(meta?.licenseDescription).toContain("SIL Open Font License")
    expect(meta?.licenseUrl).toBe("https://scripts.sil.org/OFL")
    expect(meta?.embeddingRestricted).toBe(false)
  })

  it("flags restricted-embedding fsType", () => {
    const ttf = buildSfnt({
      name: buildNameTable({ 1: "Fonte" }),
      "OS/2": buildOs2Table(400, false, 0x0002),
    })
    expect(parseFontMetadata(ttf)?.embeddingRestricted).toBe(true)
  })

  it("does not flag fsType with preview or editable bits", () => {
    const ttf = buildSfnt({
      name: buildNameTable({ 1: "Fonte" }),
      "OS/2": buildOs2Table(400, false, 0x0006),
    })
    expect(parseFontMetadata(ttf)?.embeddingRestricted).toBe(false)
  })
})
