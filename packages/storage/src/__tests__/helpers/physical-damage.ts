import fs from "node:fs"
import { openBookDb } from "../../db.js"

/** Fault injection into an actual node_data leaf cell, with every SQL tracking
 * trigger intact. Matching a string globally is unsafe: other rows may contain
 * the same snapshot. Resolve the table B-tree and exact rowid first instead.
 * Fixtures deliberately keep the payload in one page (no overflow-cell parser). */
export function damageNodePayload(dbPath: string, node: string, itemId: string, version: number): string {
  const db = openBookDb(dbPath)
  let row: { rowid: number; data: string }, root: number
  try {
    db.exec("VACUUM")
    row = db.get("SELECT rowid,data FROM node_data WHERE node=? AND item_id=? AND version=?", [node, itemId, version]) as typeof row
    root = (db.get("SELECT rootpage FROM sqlite_master WHERE name='node_data'") as { rootpage: number }).rootpage
  } finally { db.close() }
  if (!row! || typeof row.data !== "string") throw new Error("Fault fixture requires a text payload")
  const bytes = fs.readFileSync(dbPath)
  const size = bytes.readUInt16BE(16) || 65536
  const pageSize = size === 1 ? 65536 : size
  const needle = Buffer.from(row.data)
  const variable = (start: number) => {
    let value = 0, offset = start
    for (let i = 0; i < 9; i++) {
      const byte = bytes[offset++]
      value = value * (i === 8 ? 256 : 128) + (i === 8 ? byte : byte & 127)
      if (i === 8 || byte < 128) return { value, offset }
    }
    throw new Error("Invalid fixture varint")
  }
  const pending = [root!]
  while (pending.length) {
    const page = pending.pop()!, base = (page - 1) * pageSize, header = base + (page === 1 ? 100 : 0)
    const kind = bytes[header], cells = bytes.readUInt16BE(header + 3)
    if (kind !== 5 && kind !== 13) throw new Error("Expected node_data table B-tree")
    for (let i = 0; i < cells; i++) {
      const cell = base + bytes.readUInt16BE(header + (kind === 5 ? 12 : 8) + i * 2)
      if (kind === 5) { pending.push(bytes.readUInt32BE(cell)); continue }
      const payload = variable(cell), identity = variable(payload.offset)
      if (identity.value !== row.rowid) continue
      if (identity.offset + payload.value > base + pageSize) throw new Error("Fault fixture payload overflow")
      const offset = bytes.indexOf(needle, identity.offset)
      if (offset < identity.offset || offset + needle.length > identity.offset + payload.value) throw new Error("Exact fixture payload not found")
      const file = fs.openSync(dbPath, "r+")
      try { fs.writeSync(file, Buffer.from("!"), 0, 1, offset); fs.fsyncSync(file) } finally { fs.closeSync(file) }
      const damaged = Buffer.from(needle); damaged[0] = 0x21
      return damaged.toString("hex").toUpperCase()
    }
    if (kind === 5) pending.push(bytes.readUInt32BE(header + 8))
  }
  throw new Error("Fixture row not found")
}
