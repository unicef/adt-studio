import path from "node:path"
import { readBookContentIdentity, type Storage } from "@adt/storage"

/** Content writes and unexplained file changes invalidate derived read models.
 * Storage preserves identity only for proven telemetry-only statements. */
export function bookStateKey(storage: Storage, bookDir: string): string {
  const db = path.join(bookDir, `${path.basename(bookDir)}.db`)
  return JSON.stringify([storage.getNodeVersionFingerprint(), readBookContentIdentity(db)])
}
