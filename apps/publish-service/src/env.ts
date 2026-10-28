export interface Env {
  DB: D1Database
  /** The old file store. Accounts set up since files moved to Static Assets have no such
   *  bucket, and their Worker is deployed without the binding. */
  SNAPSHOTS?: R2Bucket
  /** Present during the Static Assets migration. Once the upload path is switched over,
   * this becomes required and SNAPSHOTS is removed. */
  ASSETS?: Fetcher
  PUBLICATION_ROOM: DurableObjectNamespace
  MGMT_SECRET?: string
  /** Set on a book host only: the one publication it serves. Bound at deploy time, so a host can
   *  never answer for another book in the account. */
  BOOK_TOKEN?: string
}
