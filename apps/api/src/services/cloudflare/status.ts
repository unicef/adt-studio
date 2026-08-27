import {
  PUBLISH_WORKER_VERSION,
  type CloudflareAuthMethod,
  type CloudflareConnectionStatus,
} from "@adt/types"
import { fetchWorkerHealth, type CloudflareClient, type FetchLike } from "./client.js"
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
    auth_method: live.authMethod ?? "token",
    worker_url: record.worker_url,
    worker_version: workerVersion,
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
      r2_bucket_name: record.r2_bucket_name,
    },
    provisioned_at: record.provisioned_at,
    updated_at: record.updated_at,
  }
}

export interface ReadConnectionStatusOptions {
  fetchFn?: FetchLike
  probeWorker?: boolean
}

/** A grant still waiting for its account choice cannot be the credential behind a
 *  connection, so it is not reported as the auth method either. */
export function readAuthMethod(store: ConnectionStore): CloudflareAuthMethod | null {
  const grant = store.readOAuth()
  if (grant && grant.account_id !== null) return "oauth"
  return store.read() ? "token" : null
}

export async function readConnectionStatus(
  store: ConnectionStore,
  options: ReadConnectionStatusOptions = {},
): Promise<CloudflareConnectionStatus> {
  const authMethod = readAuthMethod(store)
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
}

export async function teardownCloudflareResources(
  client: CloudflareClient,
  record: CloudflareConnectionRecord,
): Promise<TeardownResult> {
  const deleted: string[] = []
  const failures: string[] = []

  const steps: Array<{ label: string; run: () => Promise<void> }> = [
    {
      label: `worker ${record.worker_name}`,
      run: () => client.deleteWorkerScript(record.worker_name),
    },
    {
      label: `D1 database ${record.d1_database_name}`,
      run: () => client.deleteD1Database(record.d1_database_uuid),
    },
    {
      label: `R2 bucket ${record.r2_bucket_name}`,
      run: () => client.deleteR2Bucket(record.r2_bucket_name),
    },
  ]

  for (const step of steps) {
    try {
      await step.run()
      deleted.push(step.label)
    } catch (error) {
      failures.push(`${step.label}: ${describeError(error)}`)
    }
  }

  return { deleted, failures }
}
