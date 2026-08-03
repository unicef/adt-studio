import type { Publication } from "@adt/types"

export interface PublicationStore {
  findByToken(token: string): Promise<Publication | null>
}

export const emptyPublicationStore: PublicationStore = {
  async findByToken() {
    return null
  },
}
