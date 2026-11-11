import fs from "node:fs"
import path from "node:path"
import type { Storage } from "@adt/storage"
import { retainedPackageOwnership } from "@adt/pipeline"

function stamp(file: string): string {
  const s = fs.statSync(file, { bigint: true, throwIfNoEntry: false })
  return s ? [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":") : "-"
}

/** A packaged page loads many assets. Reuse only the expensive ownership
 * projection; each request still takes database admission and revalidates the
 * selected entity versions. File identities cover package swaps and SQLite
 * writes outside supported versioned saves. HTML bytes are checked on serve.
 * No timers, cached content, or durable freshness state. */
export function createRetainedPackageReader() {
  const proofs = new Map<string, { key: string; members: Map<string, string>; value: ReturnType<typeof retainedPackageOwnership> }>()
  return (db: Storage, bookDb: string, root: string) => {
    const key = JSON.stringify([
      db.getNodeVersionFingerprint(), ...[bookDb, bookDb + "-wal", root,
        path.join(root, "content"), path.join(root, "content/pages.json"), path.join(root, ".build-owners"),
        path.join(root, "index.html"), path.join(root, "assets/offline-preloader.js")].map(stamp),
    ])
    const hit = proofs.get(root)
    if (hit?.key === key && [...hit.members].every(([file, identity]) => stamp(file) === identity)) return hit.value
    const value = retainedPackageOwnership(db, root)
    // Bound retained metadata; the book's source HTML and media are never cached.
    proofs.delete(root)
    if (proofs.size >= 8) proofs.delete(proofs.keys().next().value!)
    const members = new Map([...value.memberDigests.keys()].map(member => {
      const file = path.join(root, member)
      return [file, stamp(file)]
    }))
    proofs.set(root, { key, members, value })
    return value
  }
}

/** One process-wide proof cache, shared by preview serving, package status,
 * the build cache check and export downloads, so a bundle's ownership is
 * projected once per change rather than once per request path. */
export const readRetainedPackageOwnership = createRetainedPackageReader()
