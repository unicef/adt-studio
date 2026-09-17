import crypto from "node:crypto"
import { retryCloudflareOperation, type CloudflareClient } from "./client.js"

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

/** The upload-session response returns hashes rather than paths. Convert those buckets back
 * into the compact base64 maps accepted by the file-upload endpoint. */
export function createStaticAssetUploadPayloads(
  buckets: string[][],
  assets: StaticAsset[],
): Array<Record<string, string>> {
  const byHash = new Map<string, string>()
  for (const asset of assets) {
    const path = normalizedPath(asset.path)
    const hash = staticAssetHash(path, asset.content)
    if (byHash.has(hash)) {
      throw new StaticAssetError(`Multiple assets have the same Cloudflare hash: ${hash}`)
    }
    byHash.set(hash, Buffer.from(asset.content).toString("base64"))
  }

  return buckets.map((bucket) => Object.fromEntries(bucket.map((hash) => {
    const content = byHash.get(hash)
    if (!content) throw new StaticAssetError(`Cloudflare requested an unknown asset hash: ${hash}`)
    return [hash, content]
  })))
}

export interface PreparedStaticAssets {
  manifest: StaticAssetManifest
  completionJwt: string
}

/** Registers a complete Worker asset collection and uploads only the content-addresses that
 * Cloudflare says it does not already hold. The caller attaches `completionJwt` to the Worker
 * upload metadata, which makes the collection live atomically with that Worker version. */
export async function prepareStaticAssets(
  client: CloudflareClient,
  workerName: string,
  assets: StaticAsset[],
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<PreparedStaticAssets> {
  const manifest = createStaticAssetManifest(assets)
  const retry = { sleep: options.sleep, attempts: 5 }
  const session = await retryCloudflareOperation(
    () => client.createStaticAssetUploadSession(workerName, manifest),
    retry,
  )
  let completionJwt = session.jwt
  for (const payload of createStaticAssetUploadPayloads(session.buckets, assets)) {
    completionJwt = await retryCloudflareOperation(
      () => client.uploadStaticAssetBucket(session.jwt, payload),
      retry,
    )
  }
  return { manifest, completionJwt }
}
