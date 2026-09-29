export interface Env {
  DB: D1Database
  SNAPSHOTS: R2Bucket
  /** Present during the Static Assets migration. Once the upload path is switched over,
   * this becomes required and SNAPSHOTS is removed. */
  ASSETS?: Fetcher
  PUBLICATION_ROOM: DurableObjectNamespace
  MGMT_SECRET?: string
}
