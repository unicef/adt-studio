import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const [sqliteFrom, dbFile, outFile] = process.argv.slice(2)
const { Database } = createRequire(sqliteFrom)("node-sqlite3-wasm")

const work = fs.mkdtempSync(path.join(os.tmpdir(), "win1-dbsnap-"))
const copy = path.join(work, "snap.db")
fs.copyFileSync(dbFile, copy)
for (const suffix of ["-wal", "-journal", "-shm"]) if (fs.existsSync(dbFile + suffix)) fs.copyFileSync(dbFile + suffix, copy + suffix)

const db = new Database(copy)
const encode = (value) => value instanceof Uint8Array ? { blob: crypto.createHash("sha256").update(value).digest("hex") } : value
const integrity = db.all("PRAGMA integrity_check").map(r => Object.values(r)[0])
const tables = {}
for (const { name } of db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")) {
  const rows = db.all(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
  tables[name] = rows.map(row => crypto.createHash("sha256").update(JSON.stringify(Object.entries(row).map(([k, v]) => [k, encode(v)]))).digest("hex"))
}
const metadata = db.all("SELECT version, data FROM node_data WHERE node='metadata' AND item_id='book' ORDER BY version").map(r => ({ version: r.version, title: JSON.parse(r.data).title }))
const currentMetadataVersion = db.all("SELECT version FROM node_current WHERE node='metadata' AND item_id='book'")[0]?.version
db.close()
fs.rmSync(work, { recursive: true, force: true })
fs.writeFileSync(outFile, JSON.stringify({ integrity, tables, metadata, currentMetadataVersion }))
