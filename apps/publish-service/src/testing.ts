import type { Publication, PublicationVersion } from "@adt/types"
import type { PublicationStore } from "./store.js"

/**
 * In-memory doubles for the D1 and R2 bindings.
 *
 * They exist so the route-shape suite can exercise real publish behaviour (zip
 * unpacking, version bumps, snapshot serving) without booting workerd. The
 * `*.integration.test.ts` suite covers the same paths against real D1 and R2 through
 * `@cloudflare/vitest-pool-workers`; these doubles are never imported by `index.ts`, so
 * they are tree-shaken out of the deployed artifact.
 */

export interface MemoryR2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string): Promise<unknown>
  get(key: string, options?: { onlyIf?: { etagDoesNotMatch?: string } }): Promise<unknown>
  keys(): string[]
  text(key: string): string | null
}

function etagOf(bytes: Uint8Array): string {
  let hash = 2166136261
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 16777619)
  }
  return `${bytes.length.toString(16)}-${(hash >>> 0).toString(16)}`
}

function toBytes(value: ArrayBuffer | ArrayBufferView | string): Uint8Array {
  if (typeof value === "string") return new TextEncoder().encode(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

export function createMemoryR2Bucket(): MemoryR2Bucket {
  const objects = new Map<string, Uint8Array>()

  return {
    async put(key, value) {
      objects.set(key, toBytes(value))
      return { key }
    },

    async get(key, options) {
      const bytes = objects.get(key)
      if (!bytes) return null
      const httpEtag = `"${etagOf(bytes)}"`

      if (options?.onlyIf?.etagDoesNotMatch === httpEtag) {
        return { key, size: bytes.length, httpEtag, etag: httpEtag.slice(1, -1) }
      }

      return {
        key,
        size: bytes.length,
        httpEtag,
        etag: httpEtag.slice(1, -1),
        body: new Response(bytes).body,
      }
    },

    keys() {
      return [...objects.keys()].sort()
    },

    text(key) {
      const bytes = objects.get(key)
      return bytes ? new TextDecoder().decode(bytes) : null
    },
  }
}

export function createMemoryPublicationStore(): PublicationStore {
  const publications = new Map<string, Publication>()
  const versions = new Map<string, PublicationVersion[]>()

  return {
    async findByToken(token) {
      const record = publications.get(token)
      return record ? { ...record } : null
    },

    async listVersions(token) {
      return [...(versions.get(token) ?? [])].sort((a, b) => a.version - b.version)
    },

    async create({ publication, pageManifest }) {
      publications.set(publication.token, { ...publication })
      const version: PublicationVersion = {
        version: publication.current_version,
        page_manifest: pageManifest,
        created_at: publication.created_at,
      }
      versions.set(publication.token, [version])
      return version
    },

    async addVersion({ token, version, pageManifest, createdAt }) {
      const record = publications.get(token)
      if (!record || record.current_version !== version - 1) return null

      const next: PublicationVersion = {
        version,
        page_manifest: pageManifest,
        created_at: createdAt,
      }
      versions.set(token, [...(versions.get(token) ?? []), next])
      const updated: Publication = { ...record, current_version: version }
      publications.set(token, updated)
      return { publication: updated, version: next }
    },

    async revoke(token, revokedAt) {
      const record = publications.get(token)
      if (!record) return null
      const updated: Publication = { ...record, revoked_at: record.revoked_at ?? revokedAt }
      publications.set(token, updated)
      return updated
    },

    async setExpiry(token, expiresAt) {
      const record = publications.get(token)
      if (!record) return null
      const updated: Publication = { ...record, expires_at: expiresAt }
      publications.set(token, updated)
      return updated
    },
  }
}
