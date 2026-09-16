import crypto from "node:crypto"
import { CloudflareApiError, retryCloudflareOperation, type CloudflareClient } from "./client.js"

export interface StaticAsset {
  path: string
  content: Uint8Array
}

export interface StaticAssetManifestEntry {
  hash: string
  size: number
}

export type StaticAssetManifest = Record<string, StaticAssetManifestEntry>

export class StaticAssetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StaticAssetError"
  }
}

function extension(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1)
  const dot = fileName.lastIndexOf(".")
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ""
}

function normalizedPath(path: string): string {
  if (!path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new StaticAssetError(`Asset path must be an absolute POSIX path: ${path}`)
  }
  const segments = path.slice(1).split("/")
  if (segments.length === 0 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new StaticAssetError(`Asset path is unsafe: ${path}`)
  }
  return path
}

/** Cloudflare's direct-upload API identifies files by the first 32 hex characters of
 * SHA-256(base64 bytes + extension). Keeping this here means the manifest and upload body
 * can never drift into different hashes. */
export function staticAssetHash(path: string, content: Uint8Array): string {
  const base64 = Buffer.from(content).toString("base64")
  return crypto.createHash("sha256").update(`${base64}${extension(path)}`).digest("hex").slice(0, 32)
}

export function createStaticAssetManifest(assets: StaticAsset[]): StaticAssetManifest {
  const manifest: StaticAssetManifest = {}
  for (const asset of assets) {
    const path = normalizedPath(asset.path)
    if (manifest[path]) throw new StaticAssetError(`Duplicate asset path: ${path}`)
    manifest[path] = { hash: staticAssetHash(path, asset.content), size: asset.content.byteLength }
  }
  return manifest
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  return Buffer.from(a).equals(Buffer.from(b))
}

/** The upload-session response returns hashes rather than paths. Convert those buckets back
 * into the compact base64 maps accepted by the file-upload endpoint. */
export function createStaticAssetUploadPayloads(
  buckets: string[][],
  assets: StaticAsset[],
): Array<Record<string, string>> {
  /**
   * Keyed by content address, so one entry per distinct file rather than per path.
   *
   * Books repeat content as a matter of course — the same narration for a paragraph and its
   * easy-read version, an identical `images.json` in every locale. Those paths hash to one
   * address and the bytes travel once, which is the entire point of a content-addressed
   * manifest: Cloudflare asks only for the addresses it does not already hold.
   */
  const byHash = new Map<string, Uint8Array>()
  for (const asset of assets) {
    const hash = staticAssetHash(normalizedPath(asset.path), asset.content)
    const seen = byHash.get(hash)
    if (seen !== undefined) {
      /** One address for two *different* files would be a truncated-SHA-256 collision, and
       *  would serve one file's content under the other's name. Vanishingly unlikely, and
       *  silent if it ever happened, so it is worth the comparison. */
      if (!sameBytes(seen, asset.content)) {
        throw new StaticAssetError(
          `Two different files share the Cloudflare content address ${hash}: ${asset.path}`,
        )
      }
      continue
    }
    byHash.set(hash, asset.content)
  }

  /** Encoded per bucket rather than up front. Cloudflare asks only for what it lacks, and
   *  base64 is a third larger again than the bytes — encoding a whole book to send a handful
   *  of files is hundreds of megabytes of strings built for nothing. */
  return buckets.map((bucket) => Object.fromEntries(bucket.map((hash) => {
    const content = byHash.get(hash)
    if (content === undefined) {
      throw new StaticAssetError(`Cloudflare requested an unknown asset hash: ${hash}`)
    }
    return [hash, Buffer.from(content).toString("base64")]
  })))
}

export interface PreparedStaticAssets {
  manifest: StaticAssetManifest
  completionJwt: string
}

/** Registers a complete Worker asset collection and uploads only the content-addresses that
 * Cloudflare says it does not already hold. The caller attaches `completionJwt` to the Worker
 * upload metadata, which makes the collection live atomically with that Worker version. */
/** Cloudflare's own uploader allows five attempts per bucket, for good reason: a book is sent
 *  in bucket-sized pieces over minutes, and one gateway hiccup in the middle would otherwise
 *  throw away every piece already accepted. A 5xx is the edge in trouble, not the request. */
const UPLOAD_ATTEMPTS = 5
const UPLOAD_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000]

function isRetryableUpload(error: unknown): boolean {
  if (!(error instanceof CloudflareApiError)) return false
  return error.status >= 500 || error.status === 429
}

async function uploadBucketWithRetry(
  client: CloudflareClient,
  sessionJwt: string,
  payload: Record<string, string>,
  sleep: (ms: number) => Promise<void>,
): Promise<string | null> {
  let lastError: unknown
  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await client.uploadStaticAssetBucket(sessionJwt, payload)
    } catch (error) {
      lastError = error
      if (!isRetryableUpload(error) || attempt === UPLOAD_ATTEMPTS - 1) throw error
      const retryAfter = error instanceof CloudflareApiError ? error.retryAfterMs : null
      await sleep(retryAfter ?? UPLOAD_BACKOFF_MS[attempt] ?? 8_000)
    }
  }
  throw lastError
}

export async function prepareStaticAssets(
  client: CloudflareClient,
  workerName: string,
  assets: StaticAsset[],
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<PreparedStaticAssets> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const manifest = createStaticAssetManifest(assets)
  const retry = { sleep, attempts: 5 }
  let session: Awaited<ReturnType<CloudflareClient["createStaticAssetUploadSession"]>>
  try {
    session = await retryCloudflareOperation(
      () => client.createStaticAssetUploadSession(workerName, manifest),
      retry,
    )
  } catch (error) {
    throw new StaticAssetError(`Cloudflare rejected the static asset manifest: ${error instanceof Error ? error.message : String(error)}`)
  }
  /**
   * Every bucket is authorised with the *session's* token, not the previous response's.
   *
   * The session token is what says "these uploads belong to this collection"; the completion
   * token is the collection's receipt, and only the response that finishes the collection
   * carries one. Feeding each response's token into the next request happened to work while
   * there was exactly one bucket — which is every book small enough to test with.
   */
  let completionJwt: string | null = session.buckets.length === 0 ? session.jwt : null
  const payloads = createStaticAssetUploadPayloads(session.buckets, assets)
  for (const [index, payload] of payloads.entries()) {
    try {
      completionJwt =
        (await uploadBucketWithRetry(client, session.jwt, payload, sleep)) ?? completionJwt
    } catch (error) {
      throw new StaticAssetError(`Cloudflare rejected static asset batch ${index + 1} of ${payloads.length}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (completionJwt === null) {
    throw new StaticAssetError(
      `Cloudflare accepted all ${payloads.length} static asset batches but never issued the token that completes the collection.`,
    )
  }

  return { manifest, completionJwt }
}
