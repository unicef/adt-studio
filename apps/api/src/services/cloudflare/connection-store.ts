import fs from "node:fs"
import path from "node:path"
import { z } from "zod"

export const CONNECTION_FILE_NAME = "cloudflare-connection.json"

export const CloudflareConnectionRecord = z.object({
  account_id: z.string().min(1),
  account_name: z.string().nullable(),
  worker_name: z.string().min(1),
  worker_url: z.string().min(1),
  worker_version: z.string().nullable(),
  worker_migration_tag: z.string().nullable(),
  workers_dev_subdomain: z.string().nullable(),
  d1_database_name: z.string().min(1),
  d1_database_uuid: z.string().min(1),
  r2_bucket_name: z.string().min(1),
  mgmt_secret: z.string().min(1),
  provisioned_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type CloudflareConnectionRecord = z.infer<typeof CloudflareConnectionRecord>

/** Cloudflare OAuth grant, stored next to the connection record under the additive
 *  `oauth` key so files written before M1a.5 keep parsing unchanged. */
export const CloudflareOAuthRecord = z.object({
  token_source: z.literal("oauth"),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).nullable(),
  expires_at: z.string().datetime(),
  scopes: z.array(z.string()),
  account_id: z.string().min(1).nullable(),
  account_name: z.string().nullable(),
  updated_at: z.string().datetime(),
})
export type CloudflareOAuthRecord = z.infer<typeof CloudflareOAuthRecord>

const OAUTH_KEY = "oauth"

const CONNECTION_KEYS = Object.keys(CloudflareConnectionRecord.shape)

export interface ConnectionStore {
  readonly filePath: string
  read(): CloudflareConnectionRecord | null
  write(record: CloudflareConnectionRecord): void
  clear(): boolean
  readOAuth(): CloudflareOAuthRecord | null
  writeOAuth(record: CloudflareOAuthRecord): void
  clearOAuth(): boolean
}

/** Account-level state — the connection is not book data, so it lives outside any book
 *  directory. The file holds MGMT_SECRET and the OAuth tokens and is written 0600; a
 *  manually pasted Cloudflare API token is never persisted. */
export function resolvePublishStateDir(booksDir: string): string {
  return (
    process.env.PUBLISH_STATE_DIR ??
    path.join(path.resolve(booksDir), ".publish-state")
  )
}

export function createConnectionStore(stateDir: string): ConnectionStore {
  const filePath = path.join(stateDir, CONNECTION_FILE_NAME)

  function readRaw(): Record<string, unknown> {
    if (!fs.existsSync(filePath)) return {}
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }

  function writeRaw(payload: Record<string, unknown>): void {
    if (Object.keys(payload).length === 0) {
      fs.rmSync(filePath, { force: true })
      return
    }
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    })
    try {
      fs.chmodSync(filePath, 0o600)
    } catch {
      // Filesystems without POSIX modes (Windows, some mounts) cannot narrow permissions.
    }
  }

  return {
    filePath,

    read() {
      const parsed = CloudflareConnectionRecord.safeParse(readRaw())
      return parsed.success ? parsed.data : null
    },

    write(record) {
      const validated = CloudflareConnectionRecord.parse(record)
      const raw = readRaw()
      const oauth = raw[OAUTH_KEY]
      writeRaw(oauth === undefined ? validated : { ...validated, [OAUTH_KEY]: oauth })
    },

    clear() {
      const raw = readRaw()
      const existed = CloudflareConnectionRecord.safeParse(raw).success
      const oauth = raw[OAUTH_KEY]
      writeRaw(oauth === undefined ? {} : { [OAUTH_KEY]: oauth })
      return existed
    },

    readOAuth() {
      const parsed = CloudflareOAuthRecord.safeParse(readRaw()[OAUTH_KEY])
      return parsed.success ? parsed.data : null
    },

    writeOAuth(record) {
      const validated = CloudflareOAuthRecord.parse(record)
      writeRaw({ ...readRaw(), [OAUTH_KEY]: validated })
    },

    clearOAuth() {
      const raw = readRaw()
      const existed = raw[OAUTH_KEY] !== undefined
      const rest = Object.fromEntries(
        Object.entries(raw).filter(([key]) => CONNECTION_KEYS.includes(key)),
      )
      writeRaw(CloudflareConnectionRecord.safeParse(rest).success ? rest : {})
      return existed
    },
  }
}
