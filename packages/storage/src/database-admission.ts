import fs from "node:fs"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { retainBookDatabase } from "./book-writer.js"

/** The single SQLite constructor boundary. Keep the shared process lease until
 * the connection and all statements are actually closed; close_v2 alone may
 * defer destruction while an unfinalized statement still uses the database. */
export function openCoordinatedDatabase(filename: string, options?: { fileMustExist?: boolean; readOnly?: boolean }): sqlite.Database {
  filename = path.join(fs.realpathSync(path.dirname(filename)), path.basename(filename))
  const release = retainBookDatabase(filename)
  let db: sqlite.Database
  try { db = new sqlite.Database(filename, options) }
  catch (error) { release(); throw error }
  const statements = new Set<sqlite.Statement>()
  const prepare = db.prepare.bind(db)
  db.prepare = (sql) => {
    const statement = prepare(sql)
    statements.add(statement)
    const finalize = statement.finalize.bind(statement)
    statement.finalize = () => {
      try { finalize() }
      finally { if (statement.isFinalized) statements.delete(statement) }
    }
    const iterate = statement.iterate.bind(statement)
    statement.iterate = function* (values, queryOptions) {
      const rows = iterate(values, queryOptions)
      for (;;) {
        // The WASM iterator does not recheck after yielding. Do not let an
        // iterator resumed after close call SQLite with a finalized pointer.
        if (statement.isFinalized || !db.isOpen) throw new Error("Database statement is closed")
        const row = rows.next()
        if (row.done) return
        yield row.value
      }
    }
    return statement
  }
  const close = db.close.bind(db)
  db.close = () => {
    let failure: unknown
    for (const statement of statements) {
      try { statement.finalize() } catch (error) { failure ??= error }
    }
    // If finalization itself failed without destroying a statement, retain
    // admission evidence rather than claim the database can safely be recovered.
    if (statements.size) throw failure ?? new Error("Database statements remain open")
    try { close() }
    finally { if (!db.isOpen) release() }
    if (failure) throw failure
  }
  return db
}
