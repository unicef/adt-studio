import zlib from "node:zlib"
import type { BookFontFormat } from "@adt/types"

export interface ParsedFontMetadata {
  format: BookFontFormat
  family: string | null
  subfamily: string | null
  weight: number
  italic: boolean
  licenseDescription: string | null
  licenseUrl: string | null
  embeddingRestricted: boolean
}

const SFNT_TRUETYPE = 0x00010000
const SFNT_TRUE = 0x74727565
const TAG_OTTO = 0x4f54544f
const TAG_WOFF = 0x774f4646
const TAG_WOF2 = 0x774f4632

export function detectFontFormat(buf: Buffer): BookFontFormat | null {
  if (buf.length < 4) return null
  const tag = buf.readUInt32BE(0)
  if (tag === TAG_WOFF) return "woff"
  if (tag === TAG_WOF2) return "woff2"
  if (tag === TAG_OTTO) return "opentype"
  if (tag === SFNT_TRUETYPE || tag === SFNT_TRUE) return "truetype"
  return null
}

type TableMap = Map<string, Buffer>

function readTag(buf: Buffer, offset: number): string {
  return buf.toString("latin1", offset, offset + 4)
}

function sfntTables(buf: Buffer): TableMap {
  const tables: TableMap = new Map()
  if (buf.length < 12) return tables
  const numTables = buf.readUInt16BE(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (rec + 16 > buf.length) break
    const tag = readTag(buf, rec)
    const offset = buf.readUInt32BE(rec + 8)
    const length = buf.readUInt32BE(rec + 12)
    if (offset + length <= buf.length) {
      tables.set(tag, buf.subarray(offset, offset + length))
    }
  }
  return tables
}

function woffTables(buf: Buffer): TableMap {
  const tables: TableMap = new Map()
  if (buf.length < 44) return tables
  const numTables = buf.readUInt16BE(12)
  for (let i = 0; i < numTables; i++) {
    const rec = 44 + i * 20
    if (rec + 20 > buf.length) break
    const tag = readTag(buf, rec)
    const offset = buf.readUInt32BE(rec + 4)
    const compLength = buf.readUInt32BE(rec + 8)
    const origLength = buf.readUInt32BE(rec + 12)
    if (offset + compLength > buf.length) continue
    const raw = buf.subarray(offset, offset + compLength)
    try {
      tables.set(tag, compLength === origLength ? raw : zlib.inflateSync(raw))
    } catch {
      // skip undecodable table
    }
  }
  return tables
}

function decodeNameString(bytes: Buffer, platformId: number): string {
  if (platformId === 3 || platformId === 0) {
    let out = ""
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes.readUInt16BE(i))
    return out
  }
  return bytes.toString("latin1")
}

interface NameRecord {
  platformId: number
  nameId: number
  languageId: number
  value: string
}

function parseNameTable(table: Buffer): NameRecord[] {
  const records: NameRecord[] = []
  if (table.length < 6) return records
  const count = table.readUInt16BE(2)
  const stringOffset = table.readUInt16BE(4)
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12
    if (rec + 12 > table.length) break
    const platformId = table.readUInt16BE(rec)
    const languageId = table.readUInt16BE(rec + 4)
    const nameId = table.readUInt16BE(rec + 6)
    const length = table.readUInt16BE(rec + 8)
    const offset = table.readUInt16BE(rec + 10)
    const start = stringOffset + offset
    if (start + length > table.length) continue
    const value = decodeNameString(table.subarray(start, start + length), platformId).trim()
    if (value) records.push({ platformId, nameId, languageId, value })
  }
  return records
}

function pickName(records: NameRecord[], nameIds: number[]): string | null {
  for (const nameId of nameIds) {
    const candidates = records.filter((r) => r.nameId === nameId)
    if (candidates.length === 0) continue
    const winEn = candidates.find((r) => r.platformId === 3 && r.languageId === 0x409)
    const win = candidates.find((r) => r.platformId === 3)
    const mac = candidates.find((r) => r.platformId === 1)
    return (winEn ?? win ?? mac ?? candidates[0]).value
  }
  return null
}

function inferWeightFromName(subfamily: string | null): number | null {
  if (!subfamily) return null
  const s = subfamily.toLowerCase()
  if (/extra\s*light|ultra\s*light/.test(s)) return 200
  if (/semi\s*bold|demi\s*bold/.test(s)) return 600
  if (/extra\s*bold|ultra\s*bold/.test(s)) return 800
  if (/\bthin\b/.test(s)) return 100
  if (/\blight\b/.test(s)) return 300
  if (/\bmedium\b/.test(s)) return 500
  if (/\bblack\b|\bheavy\b/.test(s)) return 900
  if (/\bbold\b/.test(s)) return 700
  if (/\bregular\b|\bnormal\b|\bbook\b/.test(s)) return 400
  return null
}

export function parseFontMetadata(buf: Buffer): ParsedFontMetadata | null {
  const format = detectFontFormat(buf)
  if (!format) return null

  let tables: TableMap | null = null
  if (format === "truetype" || format === "opentype") tables = sfntTables(buf)
  else if (format === "woff") tables = woffTables(buf)

  let family: string | null = null
  let subfamily: string | null = null
  let weight: number | null = null
  let italic = false
  let licenseDescription: string | null = null
  let licenseUrl: string | null = null
  let embeddingRestricted = false

  const nameTable = tables?.get("name")
  if (nameTable) {
    const records = parseNameTable(nameTable)
    family = pickName(records, [16, 1])
    subfamily = pickName(records, [17, 2])
    licenseDescription = pickName(records, [13])
    licenseUrl = pickName(records, [14])
  }

  const os2 = tables?.get("OS/2")
  if (os2 && os2.length >= 64) {
    const usWeightClass = os2.readUInt16BE(4)
    if (usWeightClass >= 1 && usWeightClass <= 1000) weight = usWeightClass
    const fsType = os2.readUInt16BE(8)
    embeddingRestricted = (fsType & 0x0002) !== 0 && (fsType & 0x000c) === 0
    italic = (os2.readUInt16BE(62) & 0x01) !== 0
  }

  if (!italic && subfamily && /italic|oblique/i.test(subfamily)) italic = true
  weight ??= inferWeightFromName(subfamily) ?? 400

  return {
    format,
    family,
    subfamily,
    weight,
    italic,
    licenseDescription,
    licenseUrl,
    embeddingRestricted,
  }
}
