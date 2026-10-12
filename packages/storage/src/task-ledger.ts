import fs from "node:fs"
import path from "node:path"
import { TaskLedgerRecord } from "@adt/types"
import { openBookDb } from "./db.js"
import { assertBookWriter } from "./book-writer.js"

/** Operational task events are append-only and deliberately outside content
 * fingerprints. An accepted request remains idempotent after restart/import. */
export function readTaskLedger(bookDir: string): TaskLedgerRecord[] {
  const file = path.join(bookDir, `${path.basename(bookDir)}.db`)
  if (!fs.existsSync(file)) return []
  const db = openBookDb(file)
  try {
    if (!db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='task_events'").length) return []
    const rows = db.all(`SELECT data FROM task_events WHERE sequence IN
      (SELECT MAX(sequence) FROM task_events GROUP BY request_id) ORDER BY sequence DESC`) as Array<{ data: string }>
    return rows.map((row) => TaskLedgerRecord.parse(JSON.parse(row.data)))
  } finally { db.close() }
}

export function appendTaskEvent(bookDir: string, value: TaskLedgerRecord): void {
  assertBookWriter(bookDir)
  const record = TaskLedgerRecord.parse(value)
  const file = path.join(bookDir, `${path.basename(bookDir)}.db`)
  if (!fs.existsSync(file)) throw new Error("Book not found")
  const db = openBookDb(file)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS task_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      data TEXT NOT NULL
    )`)
    const prior = db.get("SELECT task_id, data FROM task_events WHERE request_id = ? ORDER BY sequence DESC LIMIT 1", [record.requestId]) as { task_id: string; data: string } | undefined
    if (prior) {
      const previous = TaskLedgerRecord.parse(JSON.parse(prior.data))
      if (previous.task.taskId !== record.task.taskId || previous.fingerprint !== record.fingerprint)
        throw new Error("Accepted task request identity cannot be reused")
    }
    db.run("INSERT INTO task_events (request_id, task_id, data) VALUES (?, ?, ?)", [record.requestId, record.task.taskId, JSON.stringify(record)])
  } finally { db.close() }
}
