import { PublicationPageEntry, type Publication, type PublicationVersion } from "@adt/types"
import type {
  AddVersionInput,
  AddVersionResult,
  CreatePublicationInput,
  PublicationStore,
} from "./store.js"

interface PublicationRow {
  token: string
  title: string
  book_label: string
  current_version: number
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

interface VersionRow {
  version: number
  page_manifest: string
  created_at: string
}

const PageManifest = PublicationPageEntry.array()

function toPublication(row: PublicationRow): Publication {
  return {
    token: row.token,
    title: row.title,
    book_label: row.book_label,
    current_version: row.current_version,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
  }
}

function toVersion(row: VersionRow): PublicationVersion {
  const parsed = PageManifest.safeParse(JSON.parse(row.page_manifest) as unknown)
  return {
    version: row.version,
    page_manifest: parsed.success ? parsed.data : [],
    created_at: row.created_at,
  }
}

export function createD1PublicationStore(db: D1Database): PublicationStore {
  const readPublication = async (token: string): Promise<Publication | null> => {
    const row = await db
      .prepare(
        `SELECT token, title, book_label, current_version, created_at, expires_at, revoked_at
         FROM publications WHERE token = ?`,
      )
      .bind(token)
      .first<PublicationRow>()
    return row ? toPublication(row) : null
  }

  return {
    findByToken: readPublication,

    async listVersions(token) {
      const result = await db
        .prepare(
          `SELECT version, page_manifest, created_at FROM versions
           WHERE token = ? ORDER BY version ASC`,
        )
        .bind(token)
        .all<VersionRow>()
      return (result.results ?? []).map(toVersion)
    },

    async create({ publication, pageManifest }: CreatePublicationInput) {
      const manifestJson = JSON.stringify(pageManifest)
      await db.batch([
        db
          .prepare(
            `INSERT INTO publications
               (token, title, book_label, current_version, created_at, expires_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          )
          .bind(
            publication.token,
            publication.title,
            publication.book_label,
            publication.current_version,
            publication.created_at,
            publication.expires_at,
          ),
        db
          .prepare(
            `INSERT INTO versions (token, version, page_manifest, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            publication.token,
            publication.current_version,
            manifestJson,
            publication.created_at,
          ),
      ])

      return {
        version: publication.current_version,
        page_manifest: pageManifest,
        created_at: publication.created_at,
      }
    },

    async addVersion({
      token,
      version,
      pageManifest,
      createdAt,
    }: AddVersionInput): Promise<AddVersionResult | null> {
      const manifestJson = JSON.stringify(pageManifest)
      const [, bump] = await db.batch([
        db
          .prepare(
            `INSERT INTO versions (token, version, page_manifest, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(token, version, manifestJson, createdAt),
        db
          .prepare(
            `UPDATE publications SET current_version = ?
             WHERE token = ? AND current_version = ?`,
          )
          .bind(version, token, version - 1),
      ])

      if ((bump?.meta.changes ?? 0) === 0) return null

      const publication = await readPublication(token)
      if (!publication) return null

      return {
        publication,
        version: { version, page_manifest: pageManifest, created_at: createdAt },
      }
    },

    async revoke(token, revokedAt) {
      const result = await db
        .prepare(`UPDATE publications SET revoked_at = COALESCE(revoked_at, ?) WHERE token = ?`)
        .bind(revokedAt, token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },

    async setExpiry(token, expiresAt) {
      const result = await db
        .prepare(`UPDATE publications SET expires_at = ? WHERE token = ?`)
        .bind(expiresAt, token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },
  }
}
