import type { Publication, PublicationPageEntry, PublicationVersion } from "@adt/types"

export interface CreatePublicationInput {
  publication: Publication
  pageManifest: PublicationPageEntry[]
}

export interface AddVersionInput {
  token: string
  version: number
  pageManifest: PublicationPageEntry[]
  createdAt: string
}

export interface AddVersionResult {
  publication: Publication
  version: PublicationVersion
}

export interface PublicationStore {
  findByToken(token: string): Promise<Publication | null>
  listVersions(token: string): Promise<PublicationVersion[]>
  create(input: CreatePublicationInput): Promise<PublicationVersion>
  /** Resolves to `null` when the publication is gone or `current_version` moved under
   *  us — the caller has already written the R2 objects for `version`, so the guard has
   *  to live in the same statement that bumps the pointer. */
  addVersion(input: AddVersionInput): Promise<AddVersionResult | null>
  revoke(token: string, revokedAt: string): Promise<Publication | null>
  setExpiry(token: string, expiresAt: string | null): Promise<Publication | null>
}

export const emptyPublicationStore: PublicationStore = {
  async findByToken() {
    return null
  },
  async listVersions() {
    return []
  },
  async create(input) {
    return {
      version: input.publication.current_version,
      page_manifest: input.pageManifest,
      created_at: input.publication.created_at,
    }
  },
  async addVersion() {
    return null
  },
  async revoke() {
    return null
  },
  async setExpiry() {
    return null
  },
}
