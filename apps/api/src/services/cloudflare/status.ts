import {
  PUBLISH_WORKER_VERSION,
  type CloudflareAuthMethod,
  type CloudflareConnectionStatus,
} from "@adt/types"
import {
  CloudflareApiError,
  fetchWorkerHealth,
  type CloudflareClient,
  type FetchLike,
} from "./client.js"
import { bookWorkerName, isBookWorkerName } from "./book-host.js"
import type { CloudflareConnectionRecord, ConnectionStore } from "./connection-store.js"
import { describeError } from "./errors.js"

export function disconnectedStatus(
  authMethod: CloudflareAuthMethod | null = null,
): CloudflareConnectionStatus {
  return {
    connected: false,
    auth_method: authMethod,
    worker_url: null,
    worker_version: null,
    worker_version_live: false,
    latest_version: PUBLISH_WORKER_VERSION,
    upgrade_available: false,
    worker_reachable: false,
    resources: null,
    provisioned_at: null,
    updated_at: null,
  }
}

export function toConnectionStatus(
  record: CloudflareConnectionRecord,
  live: {
    workerVersion: string | null
    reachable: boolean
    authMethod?: CloudflareAuthMethod
  },
): CloudflareConnectionStatus {
  const workerVersion = live.workerVersion ?? record.worker_version
  return {
    connected: true,
    auth_method: live.authMethod ?? null,
    worker_url: record.worker_url,
    worker_version: workerVersion,
    worker_version_live: live.workerVersion !== null,
    latest_version: PUBLISH_WORKER_VERSION,
    upgrade_available: workerVersion !== null && workerVersion !== PUBLISH_WORKER_VERSION,
    worker_reachable: live.reachable,
    resources: {
      account_id: record.account_id,
      account_name: record.account_name,
      worker_name: record.worker_name,
      workers_dev_subdomain: record.workers_dev_subdomain,
      d1_database_name: record.d1_database_name,
      d1_database_uuid: record.d1_database_uuid,
    },
    provisioned_at: record.provisioned_at,
    updated_at: record.updated_at,
  }
}

export interface ReadConnectionStatusOptions {
  fetchFn?: FetchLike
  probeWorker?: boolean
  /** The request carried a pasted API token: the server never stores one, so only the
   *  request can say a token stands behind the connection. */
  hasTokenHeaders?: boolean
}

/** A grant still waiting for its account choice cannot be the credential behind a
 *  connection, so it is not reported as the auth method either. With neither a grant nor a
 *  pasted token the answer is `null`, which on a connected status means the login was lost
 *  and the user has to sign in again. */
export function readAuthMethod(
  store: ConnectionStore,
  hasTokenHeaders = false,
): CloudflareAuthMethod | null {
  const grant = store.readOAuth()
  if (grant && grant.account_id !== null) return "oauth"
  return hasTokenHeaders ? "token" : null
}

export async function readConnectionStatus(
  store: ConnectionStore,
  options: ReadConnectionStatusOptions = {},
): Promise<CloudflareConnectionStatus> {
  const authMethod = readAuthMethod(store, options.hasTokenHeaders)
  const record = store.read()
  if (!record) return disconnectedStatus(authMethod)

  if (options.probeWorker === false) {
    return toConnectionStatus(record, {
      workerVersion: null,
      reachable: false,
      ...(authMethod === null ? {} : { authMethod }),
    })
  }

  const health = await fetchWorkerHealth(record.worker_url, options.fetchFn)
  return toConnectionStatus(record, {
    workerVersion: health.version,
    reachable: health.reachable,
    ...(authMethod === null ? {} : { authMethod }),
  })
}

export interface TeardownResult {
  deleted: string[]
  failures: string[]
  /** The database was already gone, so only the books on this machine named their Workers. */
  inventoryIncomplete: boolean
  /** After an incomplete inventory: book-shaped Workers still in the account, which nothing
   *  here could tie to this setup. `null` when the account's Workers could not be listed. */
  leftoverBookWorkers: string[] | null
}

function isNotFound(error: unknown): boolean {
  return error instanceof CloudflareApiError && error.isNotFound
}

/** Every token the control plane ever registered: published books, revoked and expired ones
 *  included, and first shares that registered an upload — the Worker is deployed only after
 *  that row exists — whether or not they were ever committed. */
const SHARE_TOKENS_SQL = "SELECT token FROM publications UNION SELECT token FROM publication_uploads"

/**
 * Deletes everything the sharing setup created in the account: each book's own Worker, then the
 * control plane Worker, then its database.
 *
 * Book Workers are named after their share token (`bookWorkerName`). The full list of tokens is
 * read first — from the database itself, plus `localTokens` from the books on this machine —
 * and nothing is deleted unless that read succeeds, so a transient failure leaves everything
 * as it was. Books go first and the shared pieces only once every one of them is gone, because
 * deleting the database deletes the list: a failure on any book stops there and keeps it.
 *
 * A database that is already gone cannot be read, and nothing else names the tokens it held.
 * The teardown then works from `localTokens` alone, says so in `inventoryIncomplete`, and lists
 * the book-shaped Workers still in the account in `leftoverBookWorkers` — reported for the
 * author to check, never deleted, since a name's shape does not prove whose share it was.
 */
export async function teardownCloudflareResources(
  client: CloudflareClient,
  record: CloudflareConnectionRecord,
  localTokens: string[],
): Promise<TeardownResult> {
  const deleted: string[] = []
  const failures: string[] = []

  let remoteTokens: string[] = []
  let inventoryIncomplete = false
  try {
    const results = await client.queryD1(record.d1_database_uuid, SHARE_TOKENS_SQL)
    remoteTokens = results
      .flatMap((result) => result.results)
      .map((row) => row.token)
      .filter((token): token is string => typeof token === "string" && token.length > 0)
  } catch (error) {
    if (!isNotFound(error)) {
      failures.push(
        `reading the shared books from D1 database ${record.d1_database_name}: ${describeError(error)} — nothing was deleted`,
      )
      return { deleted, failures, inventoryIncomplete, leftoverBookWorkers: [] }
    }
    inventoryIncomplete = true
  }

  async function remove(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
      deleted.push(label)
    } catch (error) {
      if (isNotFound(error)) {
        deleted.push(label)
        return
      }
      failures.push(`${label}: ${describeError(error)}`)
    }
  }

  const bookWorkers = [...new Set([...remoteTokens, ...localTokens].map(bookWorkerName))]
  for (const name of bookWorkers) {
    await remove(`book worker ${name}`, () => client.deleteWorkerScript(name))
  }
  if (failures.length > 0) {
    return { deleted, failures, inventoryIncomplete, leftoverBookWorkers: [] }
  }

  await remove(`worker ${record.worker_name}`, () => client.deleteWorkerScript(record.worker_name))
  if (failures.length > 0) {
    return { deleted, failures, inventoryIncomplete, leftoverBookWorkers: [] }
  }
  await remove(`D1 database ${record.d1_database_name}`, () =>
    client.deleteD1Database(record.d1_database_uuid),
  )
  if (!inventoryIncomplete || failures.length > 0) {
    return { deleted, failures, inventoryIncomplete, leftoverBookWorkers: [] }
  }

  let leftoverBookWorkers: string[] | null
  try {
    const scripts = await client.listWorkerScripts()
    leftoverBookWorkers = scripts.map((script) => script.id).filter(isBookWorkerName).sort()
  } catch {
    leftoverBookWorkers = null
  }
  return { deleted, failures, inventoryIncomplete, leftoverBookWorkers }
}
