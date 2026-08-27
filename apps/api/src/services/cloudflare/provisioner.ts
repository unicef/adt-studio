import crypto from "node:crypto"
import {
  CLOUDFLARE_D1_DATABASE_NAME,
  CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_WORKER_NAME,
  PUBLISH_WORKER_VERSION,
  type CloudflareAuthMethod,
  type CloudflareConnectionStatus,
  type ProvisionProgressEvent,
  type ProvisionStepId,
  provisionStep,
  workersDevUrl,
} from "@adt/types"
import { probeCloudflareAccess } from "./access.js"
import {
  CloudflareApiError,
  fetchWorkerHealth,
  type CloudflareClient,
  type FetchLike,
} from "./client.js"
import {
  type CloudflareConnectionRecord,
  type ConnectionStore,
} from "./connection-store.js"
import { ProvisionError, describeError, isProvisionError } from "./errors.js"
import { toConnectionStatus } from "./status.js"
import type { WorkerArtifact, WorkerArtifactBinding } from "./worker-artifact.js"

export const MIGRATIONS_TABLE = "_migrations"
export const MGMT_SECRET_BYTES = 32

export type ProvisionEmit = (event: ProvisionProgressEvent) => void | Promise<void>

export interface ProvisionOptions {
  client: CloudflareClient
  artifact: WorkerArtifact
  store: ConnectionStore
  emit: ProvisionEmit
  authMethod?: CloudflareAuthMethod
  fetchFn?: FetchLike
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  generateSecret?: () => string
  healthAttempts?: number
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function generateMgmtSecret(): string {
  return crypto.randomBytes(MGMT_SECRET_BYTES).toString("base64url")
}

function alreadyExists(error: unknown): boolean {
  return error instanceof CloudflareApiError && /already exists|duplicate/i.test(error.message)
}

function mentionsMigration(error: unknown): boolean {
  return error instanceof CloudflareApiError && /migration/i.test(error.message)
}

export function resolveWorkerBindings(
  bindings: WorkerArtifactBinding[],
  context: { d1DatabaseUuid: string; r2BucketName: string; mgmtSecret: string },
): Array<Record<string, unknown>> {
  return bindings.map((binding) => {
    switch (binding.type) {
      case "d1":
        return { type: "d1", name: binding.name, id: context.d1DatabaseUuid }
      case "r2_bucket":
        return { type: "r2_bucket", name: binding.name, bucket_name: context.r2BucketName }
      case "durable_object_namespace":
        return {
          type: "durable_object_namespace",
          name: binding.name,
          class_name: binding.class_name,
        }
      case "secret_text":
        return { type: "secret_text", name: binding.name, text: context.mgmtSecret }
      default:
        throw new ProvisionError({
          code: "upload_failed",
          stepId: "upload-worker",
          message: `Unsupported worker binding type "${binding.type}" in metadata.json`,
        })
    }
  })
}

interface StepRunner {
  <T>(id: ProvisionStepId, run: () => Promise<T>): Promise<T>
}

export async function provisionCloudflare(
  options: ProvisionOptions,
): Promise<CloudflareConnectionStatus> {
  const {
    client,
    artifact,
    store,
    emit,
    authMethod = "token",
    fetchFn,
    sleep = defaultSleep,
    now = () => new Date(),
    generateSecret = generateMgmtSecret,
    healthAttempts = 8,
  } = options

  const existing = store.read()
  let stepMessage: string | undefined

  const runStep: StepRunner = async (id, run) => {
    const step = provisionStep(id)
    stepMessage = undefined
    await emit({ type: "step", id, number: step.number, label: step.label, status: "running" })
    try {
      const result = await run()
      await emit({
        type: "step",
        id,
        number: step.number,
        label: step.label,
        status: "done",
        ...(stepMessage === undefined ? {} : { message: stepMessage }),
      })
      return result
    } catch (error) {
      const provisionError = isProvisionError(error)
        ? error
        : new ProvisionError({
            code: "partial_provision",
            stepId: id,
            message: describeError(error),
            cause: error,
          })
      await emit({
        type: "step",
        id,
        number: step.number,
        label: step.label,
        status: "error",
        error: provisionError.message,
      })
      throw provisionError
    }
  }

  const accountName = await runStep("verify-token", async () => {
    const probe = await probeCloudflareAccess(client, { verifyToken: authMethod !== "oauth" })
    if (probe.tokenInvalid) {
      throw new ProvisionError({
        code: "bad_token_scope",
        stepId: "verify-token",
        message:
          "The Cloudflare API token is invalid or inactive. Create a new token with the required permissions.",
        missingScopes: probe.missingScopes,
      })
    }
    if (probe.accountNotFound) {
      throw new ProvisionError({
        code: "account_not_found",
        stepId: "verify-token",
        message: `Cloudflare account ${client.accountId} was not found, or the token cannot read it.`,
      })
    }
    if (probe.missingScopes.length > 0) {
      throw new ProvisionError({
        code: "bad_token_scope",
        stepId: "verify-token",
        message:
          authMethod === "oauth"
            ? `This Cloudflare login is missing these permissions: ${probe.missingScopes.join(", ")}. Disconnect and connect again, and allow every permission ADT Studio asks for.`
            : `The Cloudflare API token is missing these permissions: ${probe.missingScopes.join(", ")}.`,
        missingScopes: probe.missingScopes,
      })
    }
    if (probe.r2NotEnabled) {
      throw new ProvisionError({
        code: "r2_not_enabled",
        stepId: "verify-token",
        message:
          "R2 storage has not been enabled on this Cloudflare account yet. Enable R2 in the Cloudflare dashboard, then try again.",
      })
    }
    stepMessage = probe.accountName ? `Account ${probe.accountName}` : undefined
    return probe.accountName
  })

  const database = await runStep("find-or-create-d1", async () => {
    const databases = await client.listD1Databases(CLOUDFLARE_D1_DATABASE_NAME)
    const found = databases.find((entry) => entry.name === CLOUDFLARE_D1_DATABASE_NAME)
    if (found) {
      stepMessage = `Reusing database ${found.name}`
      return found
    }
    try {
      const created = await client.createD1Database(CLOUDFLARE_D1_DATABASE_NAME)
      stepMessage = `Created database ${created.name}`
      return created
    } catch (error) {
      if (!alreadyExists(error)) throw error
      const retry = (await client.listD1Databases(CLOUDFLARE_D1_DATABASE_NAME)).find(
        (entry) => entry.name === CLOUDFLARE_D1_DATABASE_NAME,
      )
      if (retry) {
        stepMessage = `Reusing database ${retry.name}`
        return retry
      }
      throw new ProvisionError({
        code: "name_collision",
        stepId: "find-or-create-d1",
        message: `A D1 database named ${CLOUDFLARE_D1_DATABASE_NAME} already exists but is not visible to this token. Rename or delete it, then provision again.`,
        cause: error,
      })
    }
  })

  await runStep("apply-migrations", async () => {
    const applied = new Set<string>()
    try {
      await client.queryD1(
        database.uuid,
        `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`,
      )
      const rows = await client.queryD1(
        database.uuid,
        `SELECT name FROM ${MIGRATIONS_TABLE};`,
      )
      for (const result of rows) {
        for (const row of result.results) {
          if (typeof row.name === "string") applied.add(row.name)
        }
      }
    } catch (error) {
      throw new ProvisionError({
        code: "migration_failed",
        stepId: "apply-migrations",
        message: `Could not read the migration history of ${CLOUDFLARE_D1_DATABASE_NAME}: ${describeError(error)}`,
        cause: error,
      })
    }

    const pending = artifact.migrations.filter((migration) => !applied.has(migration.name))
    for (const migration of pending) {
      try {
        await client.queryD1(database.uuid, migration.sql)
        await client.queryD1(
          database.uuid,
          `INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?);`,
          [migration.name, now().toISOString()],
        )
      } catch (error) {
        throw new ProvisionError({
          code: "migration_failed",
          stepId: "apply-migrations",
          message: `Migration ${migration.name} failed: ${describeError(error)}`,
          cause: error,
        })
      }
    }

    stepMessage =
      pending.length === 0
        ? "Schema already up to date"
        : `Applied ${pending.map((migration) => migration.name).join(", ")}`
  })

  await runStep("find-or-create-r2", async () => {
    const buckets = await client.listR2Buckets()
    if (buckets.some((bucket) => bucket.name === CLOUDFLARE_R2_BUCKET_NAME)) {
      stepMessage = `Reusing bucket ${CLOUDFLARE_R2_BUCKET_NAME}`
      return
    }
    try {
      await client.createR2Bucket(CLOUDFLARE_R2_BUCKET_NAME)
      stepMessage = `Created bucket ${CLOUDFLARE_R2_BUCKET_NAME}`
    } catch (error) {
      if (!alreadyExists(error)) throw error
      stepMessage = `Reusing bucket ${CLOUDFLARE_R2_BUCKET_NAME}`
    }
  })

  const mgmtSecret = existing?.mgmt_secret ?? generateSecret()

  const uploadedMigrationTag = await runStep("upload-worker", async () => {
    const scripts = await client.listWorkerScripts().catch(() => [])
    const scriptExists = scripts.some((script) => script.id === CLOUDFLARE_WORKER_NAME)
    const migrationTag = artifact.metadata.migrations.new_tag
    const needsMigrations =
      !scriptExists || existing?.worker_migration_tag !== migrationTag

    const bindings = resolveWorkerBindings(artifact.metadata.bindings, {
      d1DatabaseUuid: database.uuid,
      r2BucketName: CLOUDFLARE_R2_BUCKET_NAME,
      mgmtSecret,
    })

    const baseMetadata: Record<string, unknown> = {
      main_module: artifact.metadata.main_module,
      compatibility_date: artifact.metadata.compatibility_date,
      bindings,
    }

    const upload = async (withMigrations: boolean) => {
      await client.uploadWorkerScript({
        name: CLOUDFLARE_WORKER_NAME,
        script: artifact.script,
        metadata: withMigrations
          ? {
              ...baseMetadata,
              migrations: {
                new_tag: migrationTag,
                new_sqlite_classes: artifact.metadata.migrations.new_sqlite_classes,
              },
            }
          : baseMetadata,
      })
    }

    try {
      await upload(needsMigrations)
    } catch (error) {
      if (needsMigrations && mentionsMigration(error)) {
        try {
          await upload(false)
          stepMessage = `Uploaded worker v${artifact.metadata.version}`
          return migrationTag
        } catch (retryError) {
          throw new ProvisionError({
            code: "upload_failed",
            stepId: "upload-worker",
            message: `Uploading ${CLOUDFLARE_WORKER_NAME} failed: ${describeError(retryError)}`,
            cause: retryError,
          })
        }
      }
      throw new ProvisionError({
        code: "upload_failed",
        stepId: "upload-worker",
        message: `Uploading ${CLOUDFLARE_WORKER_NAME} failed: ${describeError(error)}`,
        cause: error,
      })
    }

    stepMessage = `Uploaded worker v${artifact.metadata.version}`
    return migrationTag
  })

  await runStep("set-mgmt-secret", async () => {
    stepMessage = existing?.mgmt_secret
      ? "Reused the existing management secret"
      : "Generated a new management secret"
  })

  const subdomain = await runStep("enable-workers-dev", async () => {
    const accountSubdomain = await client.getWorkersDevSubdomain()
    if (!accountSubdomain) {
      throw new ProvisionError({
        code: "no_workers_subdomain",
        stepId: "enable-workers-dev",
        message:
          "This Cloudflare account has no workers.dev subdomain yet. Pick one in the Cloudflare dashboard under Workers & Pages, then provision again.",
      })
    }
    await client.enableScriptSubdomain(CLOUDFLARE_WORKER_NAME)
    stepMessage = `${CLOUDFLARE_WORKER_NAME}.${accountSubdomain}.workers.dev`
    return accountSubdomain
  })

  const workerUrl = workersDevUrl(CLOUDFLARE_WORKER_NAME, subdomain)

  const deployedVersion = await runStep("verify-deployment", async () => {
    let lastVersion: string | null = null
    let reachable = false
    for (let attempt = 0; attempt < healthAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(Math.min(500 * 2 ** (attempt - 1), 8000))
      }
      const health = await fetchWorkerHealth(workerUrl, fetchFn)
      reachable = reachable || health.reachable
      lastVersion = health.version ?? lastVersion
      if (health.version === PUBLISH_WORKER_VERSION) {
        stepMessage = `Worker ${workerUrl} reports v${health.version}`
        return health.version
      }
    }

    if (!reachable) {
      throw new ProvisionError({
        code: "partial_provision",
        stepId: "verify-deployment",
        message: `Everything is provisioned, but ${workerUrl} did not answer /health yet. workers.dev propagation can lag — resume from step 8 in a minute.`,
      })
    }

    throw new ProvisionError({
      code: "stale_deployment",
      stepId: "verify-deployment",
      message: `${workerUrl} reports version ${lastVersion ?? "unknown"} but this Studio ships v${PUBLISH_WORKER_VERSION}.`,
    })
  })

  const timestamp = now().toISOString()
  const record: CloudflareConnectionRecord = {
    account_id: client.accountId,
    account_name: accountName,
    worker_name: CLOUDFLARE_WORKER_NAME,
    worker_url: workerUrl,
    worker_version: deployedVersion,
    worker_migration_tag: uploadedMigrationTag,
    workers_dev_subdomain: subdomain,
    d1_database_name: database.name,
    d1_database_uuid: database.uuid,
    r2_bucket_name: CLOUDFLARE_R2_BUCKET_NAME,
    mgmt_secret: mgmtSecret,
    provisioned_at: existing?.provisioned_at ?? timestamp,
    updated_at: timestamp,
  }
  store.write(record)

  const status = toConnectionStatus(record, {
    workerVersion: deployedVersion,
    reachable: true,
    authMethod,
  })
  await emit({ type: "complete", connection: status })
  return status
}
