import fs from "node:fs"
import { createHash } from "node:crypto"

const validators = new Map<string, { identity: string; etag: string }>()
const identity = (file: string) => {
  const stat = fs.statSync(file, { bigint: true })
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":")
}
const matches = (header: string | undefined, etag: string) =>
  header?.split(",").some(value => value.trim().replace(/^W\//, "") === etag) ?? false

/** Only a byte validator: callers must first admit the book and authorize the
 * canonical member against its current origin/part proof. No content, handle,
 * lease or authorization is retained. HTML/preloader use their separate proof. */
export function readPreviewAsset(file: string, ifNoneMatch?: string) {
  file = fs.realpathSync(file)
  const before = identity(file)
  const hit = validators.get(file)
  if (hit?.identity === before && matches(ifNoneMatch, hit.etag)) return { etag: hit.etag, bytes: null }
  const bytes = fs.readFileSync(file)
  const after = identity(file)
  const etag = hit?.identity === before && before === after
    ? hit.etag : `"${createHash("sha256").update(bytes).digest("hex")}"`
  validators.delete(file)
  if (before === after) {
    if (validators.size >= 512) validators.delete(validators.keys().next().value!)
    validators.set(file, { identity: after, etag })
  }
  return { etag, bytes: matches(ifNoneMatch, etag) ? null : bytes }
}
