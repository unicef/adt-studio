export interface Env {
  DB: D1Database
  SNAPSHOTS: R2Bucket
  PUBLICATION_ROOM: DurableObjectNamespace
  MGMT_SECRET?: string
}
