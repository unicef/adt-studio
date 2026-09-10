import { env } from "cloudflare:test"
import { createD1PublicationStore } from "../src/d1-store.js"

/** Fresh bindings for route tests, using the same D1/R2 implementation as the Worker. */
export async function resetBindings(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM comments"),
    env.DB.prepare("DELETE FROM sessions"),
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
