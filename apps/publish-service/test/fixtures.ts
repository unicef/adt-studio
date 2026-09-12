import { env } from "cloudflare:test"
import { createD1PublicationStore } from "../src/d1-store.js"

/** Fresh bindings for route tests, using the same D1/R2 implementation as the Worker. */
export async function resetBindings(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM publication_upload_files"),
    env.DB.prepare("DELETE FROM publication_uploads"),
    env.DB.prepare("DELETE FROM versions"),
    env.DB.prepare("DELETE FROM publications"),
    env.DB.prepare("DELETE FROM access_attempts"),
  ])
  // Test snapshots use known publication prefixes; delete all objects in this local binding.
  let cursor: string | undefined
  do {
    const page = await env.SNAPSHOTS.list({ cursor })
    if (page.objects.length) await env.SNAPSHOTS.delete(page.objects.map(({ key }) => key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}

export function createTestStore() {
  return createD1PublicationStore(env.DB)
}

export const testBucket = env.SNAPSHOTS

/** Sends one request against the worker under test, with its `env` already bound. */
export type Send = (input: string, init?: RequestInit) => Promise<Response>

export interface PublishSnapshotInput {
  token: string
  title?: string
  bookLabel?: string
  pageManifest: unknown
  files: Record<string, string>
  expiresAt?: string | null
  accessCode?: string
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Publishes a complete snapshot through the production start → upload → commit protocol. */
export async function publishSnapshot(
  send: Send,
  base: string,
  secret: string,
  input: PublishSnapshotInput,
): Promise<{ token: string; version: number }> {
  const encoder = new TextEncoder()
  const files = await Promise.all(
    Object.entries(input.files).map(async ([path, body]) => {
      const bytes = encoder.encode(body)
      return { path, body: bytes, bytes: bytes.byteLength, sha256: await sha256(bytes) }
    }),
  )
  const start = await send(`${base}/api/publication-uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      kind: input.title === undefined ? "version" : "create",
      token: input.token,
      ...(input.title === undefined
        ? {}
        : {
            title: input.title,
            book_label: input.bookLabel ?? "book",
            expires_at: input.expiresAt,
            access_code: input.accessCode,
          }),
      page_manifest: input.pageManifest,
      files: files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    }),
  })
  if (start.status !== 201) {
    throw new Error(`Starting upload failed: ${start.status} ${await start.text()}`)
  }
  const { upload_id: uploadId, version } = (await start.json()) as {
    upload_id: string
    version: number
  }
  for (const file of files) {
    const response = await send(
      `${base}/api/publication-uploads/${uploadId}/files/${file.path.split("/").map(encodeURIComponent).join("/")}`,
      { method: "PUT", headers: { Authorization: `Bearer ${secret}` }, body: file.body },
    )
    if (response.status !== 200) {
      throw new Error(`Uploading ${file.path} failed: ${response.status} ${await response.text()}`)
    }
  }
  const committed = await send(`${base}/api/publication-uploads/${uploadId}/commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (committed.status !== 201) {
    throw new Error(`Committing upload failed: ${committed.status} ${await committed.text()}`)
  }
  return { token: input.token, version }
}

/**
 * Uploads a version's files the way the Studio does — one request each — and returns the byte
 * total the following metadata call has to declare.
 *
 * There is no archive upload any more, so a test that wants a served snapshot has to stream it
 * exactly as the client does. That is the point: the tests used to build a zip and post it,
 * which exercised a path the Studio never took.
 */
export async function uploadSnapshotFiles(
  send: Send,
  base: string,
  secret: string,
  token: string,
  version: number,
  files: Record<string, string>,
): Promise<number> {
  const encoder = new TextEncoder()
  let total = 0
  for (const [path, body] of Object.entries(files)) {
    const bytes = encoder.encode(body)
    const encoded = path.split("/").map(encodeURIComponent).join("/")
    const response = await send(
      `${base}/api/publications/${token}/files/${version}/${encoded}`,
      { method: "PUT", headers: { Authorization: `Bearer ${secret}` }, body: bytes },
    )
    if (response.status !== 200) {
      throw new Error(`Uploading ${path} failed: ${response.status} ${await response.text()}`)
    }
    total += bytes.byteLength
  }
  return total
}
