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

export interface ConnectionStore {
  readonly filePath: string
  read(): CloudflareConnectionRecord | null
  write(record: CloudflareConnectionRecord): void
  clear(): boolean
}

/** Account-level state — the connection is not book data, so it lives outside any book
 *  directory. The file holds MGMT_SECRET and is written 0600; the Cloudflare API token
 *  is never persisted. */
export function resolvePublishStateDir(booksDir: string): string {
  return (
    process.env.PUBLISH_STATE_DIR ??
    path.join(path.resolve(booksDir), ".publish-state")
  )
}

export function createConnectionStore(stateDir: string): ConnectionStore {
  const filePath = path.join(stateDir, CONNECTION_FILE_NAME)

  return {
    filePath,

    read() {
      if (!fs.existsSync(filePath)) return null
      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
      } catch {
        return null
      }
      const parsed = CloudflareConnectionRecord.safeParse(raw)
      return parsed.success ? parsed.data : null
    },

    write(record) {
      const validated = CloudflareConnectionRecord.parse(record)
      fs.mkdirSync(stateDir, { recursive: true })
      fs.writeFileSync(filePath, `${JSON.stringify(validated, null, 2)}\n`, {
        encoding: "utf-8",
        mode: 0o600,
      })
      try {
        fs.chmodSync(filePath, 0o600)
      } catch {
        // Filesystems without POSIX modes (Windows, some mounts) cannot narrow permissions.
      }
    },

    clear() {
      if (!fs.existsSync(filePath)) return false
      fs.rmSync(filePath, { force: true })
      return true
    },
  }
}
