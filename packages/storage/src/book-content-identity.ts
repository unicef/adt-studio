import fs from "node:fs"
import path from "node:path"

// In-memory aliases for observed database identities, never durable freshness
// state. An unexplained file change always breaks the alias. Eviction only
// causes a cold verification; it cannot authorize an old proof.
const identities = new Map<string, { physical: string; content: string }>()
const limit = 256

function physicalIdentity(dbPath: string): string {
  return JSON.stringify([dbPath, ...[dbPath, `${dbPath}-wal`].map(file => {
    const stat = fs.statSync(file, { bigint: true, throwIfNoEntry: false })
    return stat ? [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":") : "-"
  })])
}

/** Database file identity with only explicitly observed telemetry writes elided.
 * Content saves, raw SQL, repairs, external writes and process restarts still
 * invalidate. Callers must also check their physical assets and config inputs. */
export function readBookContentIdentity(dbPath: string): string {
  dbPath = path.resolve(dbPath)
  const physical = physicalIdentity(dbPath)
  const previous = identities.get(dbPath)
  const entry = previous?.physical === physical ? previous : { physical, content: physical }
  identities.delete(dbPath)
  if (identities.size >= limit) identities.delete(identities.keys().next().value!)
  identities.set(dbPath, entry)
  return entry.content
}

/** Internal storage boundary: call only for an autocommitted, trigger-free
 * telemetry statement. Never wrap a general transaction or arbitrary caller. */
export function preserveContentIdentityAcrossTelemetry(dbPath: string, operation: () => void): void {
  dbPath = path.resolve(dbPath)
  const previous = identities.get(dbPath)
  const unchanged = previous && previous.physical === physicalIdentity(dbPath)
  operation()
  if (unchanged) previous.physical = physicalIdentity(dbPath)
}
