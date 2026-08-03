import { describe, expect, it } from "vitest"
import {
  CLOUDFLARE_D1_DATABASE_NAME,
  CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_WORKER_NAME,
  PROVISION_STEPS,
  PUBLISH_WORKER_VERSION,
  type CloudflareConnectionStatus,
  type ProvisionProgressEvent,
  type ProvisionStepId,
} from "@adt/types"
import { createCloudflareClient } from "./client.js"
import type { CloudflareConnectionRecord, ConnectionStore } from "./connection-store.js"
import { ProvisionError } from "./errors.js"
import { createFakeCloudflare, type FakeCloudflareOptions } from "./fake-cloudflare-api.js"
import { provisionCloudflare } from "./provisioner.js"
import type { WorkerArtifact } from "./worker-artifact.js"

const NOW = new Date("2026-08-03T12:00:00.000Z")

function memoryStore(initial: CloudflareConnectionRecord | null = null): ConnectionStore {
  let record = initial
  return {
    filePath: "/memory/cloudflare-connection.json",
    read: () => record,
    write: (next) => {
      record = next
    },
    clear: () => {
      const had = record !== null
      record = null
      return had
    },
  }
}

function artifact(
  migrations: WorkerArtifact["migrations"] = [
    { name: "0001_init.sql", sql: "CREATE TABLE IF NOT EXISTS publications (token TEXT PRIMARY KEY);" },
  ],
): WorkerArtifact {
  return {
    script: "export default { fetch() {} }",
    metadata: {
      version: PUBLISH_WORKER_VERSION,
      main_module: "worker.js",
      compatibility_date: "2026-07-01",
      bindings: [
        { type: "d1", name: "DB" },
        { type: "r2_bucket", name: "SNAPSHOTS" },
        {
          type: "durable_object_namespace",
          name: "PUBLICATION_ROOM",
          class_name: "PublicationRoom",
        },
        { type: "secret_text", name: "MGMT_SECRET" },
      ],
      migrations: { new_tag: "v1", new_sqlite_classes: ["PublicationRoom"] },
      d1_migrations: migrations.map((migration) => migration.name),
    },
    migrations,
    artifactDir: "/fake/dist",
    migrationsDir: "/fake/migrations",
  }
}

interface RunResult {
  events: ProvisionProgressEvent[]
  fake: ReturnType<typeof createFakeCloudflare>
  store: ConnectionStore
  status: CloudflareConnectionStatus | null
  error: ProvisionError | null
}

async function run(options: {
  fake?: FakeCloudflareOptions
  store?: ConnectionStore
  artifact?: WorkerArtifact
  secret?: string
  healthAttempts?: number
} = {}): Promise<RunResult> {
  const fake = createFakeCloudflare(options.fake)
  const store = options.store ?? memoryStore()
  const events: ProvisionProgressEvent[] = []

  let status: CloudflareConnectionStatus | null = null
  let error: ProvisionError | null = null
  try {
    status = await provisionCloudflare({
      client: createCloudflareClient({
        token: "cf-token",
        accountId: "acct-1",
        fetchFn: fake.fetchFn,
      }),
      artifact: options.artifact ?? artifact(),
      store,
      emit: (event) => {
        events.push(event)
      },
      fetchFn: fake.fetchFn,
      sleep: async () => {},
      now: () => NOW,
      generateSecret: () => options.secret ?? "mgmt-secret-1",
      healthAttempts: options.healthAttempts ?? 3,
    })
  } catch (caught) {
    if (!(caught instanceof ProvisionError)) throw caught
    error = caught
  }

  return { events, fake, store, status, error }
}

function stepEvents(events: ProvisionProgressEvent[]) {
  return events.filter((event) => event.type === "step")
}

function finishedStep(events: ProvisionProgressEvent[], id: ProvisionStepId) {
  return stepEvents(events).find(
    (event) => event.id === id && event.status !== "running",
  )
}

function uploadedMetadata(fake: RunResult["fake"]): Record<string, unknown> {
  const script = fake.state.scripts.get(CLOUDFLARE_WORKER_NAME)
  if (!script) throw new Error("worker script was not uploaded")
  return script.metadata
}

describe("provisionCloudflare — happy path", () => {
  it("runs all eight steps in order and returns a connected status", async () => {
    const { events, status, error } = await run()

    expect(error).toBeNull()
    const done = stepEvents(events).filter((event) => event.status === "done")
    expect(done.map((event) => event.id)).toEqual(PROVISION_STEPS.map((step) => step.id))
    expect(done.map((event) => event.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(events.at(-1)).toMatchObject({ type: "complete" })
    expect(status).toMatchObject({
      connected: true,
      worker_url: `https://${CLOUDFLARE_WORKER_NAME}.teacher.workers.dev`,
      worker_version: PUBLISH_WORKER_VERSION,
      latest_version: PUBLISH_WORKER_VERSION,
      upgrade_available: false,
      worker_reachable: true,
    })
    expect(status?.resources).toMatchObject({
      account_id: "acct-1",
      account_name: "Test Account",
      d1_database_name: CLOUDFLARE_D1_DATABASE_NAME,
      r2_bucket_name: CLOUDFLARE_R2_BUCKET_NAME,
      workers_dev_subdomain: "teacher",
    })
  })

  it("creates the named resources, applies the migration and enables workers.dev", async () => {
    const { fake } = await run()

    expect(fake.state.databases).toEqual([{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }])
    expect(fake.state.buckets).toEqual([CLOUDFLARE_R2_BUCKET_NAME])
    expect(fake.state.executedSql).toHaveLength(1)
    expect(fake.state.migrationRows.map((row) => row.name)).toEqual(["0001_init.sql"])
    expect(fake.state.subdomainEnabledFor).toEqual([CLOUDFLARE_WORKER_NAME])
  })

  it("uploads bindings resolved against the created resources plus the DO migration", async () => {
    const { fake } = await run()
    const metadata = uploadedMetadata(fake)

    expect(metadata).toMatchObject({
      main_module: "worker.js",
      compatibility_date: "2026-07-01",
      migrations: { new_tag: "v1", new_sqlite_classes: ["PublicationRoom"] },
    })
    expect(metadata.bindings).toEqual([
      { type: "d1", name: "DB", id: "db-uuid-1" },
      { type: "r2_bucket", name: "SNAPSHOTS", bucket_name: CLOUDFLARE_R2_BUCKET_NAME },
      {
        type: "durable_object_namespace",
        name: "PUBLICATION_ROOM",
        class_name: "PublicationRoom",
      },
      { type: "secret_text", name: "MGMT_SECRET", text: "mgmt-secret-1" },
    ])
  })

  it("persists the connection record including the management secret", async () => {
    const { store } = await run()
    expect(store.read()).toEqual({
      account_id: "acct-1",
      account_name: "Test Account",
      worker_name: CLOUDFLARE_WORKER_NAME,
      worker_url: `https://${CLOUDFLARE_WORKER_NAME}.teacher.workers.dev`,
      worker_version: PUBLISH_WORKER_VERSION,
      worker_migration_tag: "v1",
      workers_dev_subdomain: "teacher",
      d1_database_name: CLOUDFLARE_D1_DATABASE_NAME,
      d1_database_uuid: "db-uuid-1",
      r2_bucket_name: CLOUDFLARE_R2_BUCKET_NAME,
      mgmt_secret: "mgmt-secret-1",
      provisioned_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    })
  })
})

describe("provisionCloudflare — idempotent re-run", () => {
  it("reuses existing resources, skips applied migrations and omits the DO migration tag", async () => {
    const first = await run()
    const record = first.store.read()
    expect(record).not.toBeNull()

    const second = await run({
      store: memoryStore(record),
      secret: "a-different-secret",
      fake: {
        databases: [{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }],
        buckets: [CLOUDFLARE_R2_BUCKET_NAME],
        scripts: [CLOUDFLARE_WORKER_NAME],
        migrationRows: [{ name: "0001_init.sql", applied_at: NOW.toISOString() }],
      },
    })

    expect(second.error).toBeNull()
    expect(second.fake.state.databases).toHaveLength(1)
    expect(second.fake.state.buckets).toEqual([CLOUDFLARE_R2_BUCKET_NAME])
    expect(second.fake.state.executedSql).toEqual([])
    expect(second.fake.state.uploadCount).toBe(1)
    expect(uploadedMetadata(second.fake).migrations).toBeUndefined()

    const skipped = finishedStep(second.events, "apply-migrations")
    expect(skipped?.message).toBe("Schema already up to date")
  })

  it("keeps MGMT_SECRET stable across re-provisions", async () => {
    const first = await run({ secret: "secret-from-first-run" })
    const second = await run({
      store: memoryStore(first.store.read()),
      secret: "secret-that-must-not-be-used",
      fake: {
        databases: [{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }],
        buckets: [CLOUDFLARE_R2_BUCKET_NAME],
        scripts: [CLOUDFLARE_WORKER_NAME],
        migrationRows: [{ name: "0001_init.sql", applied_at: NOW.toISOString() }],
      },
    })

    expect(second.store.read()?.mgmt_secret).toBe("secret-from-first-run")
    expect(uploadedMetadata(second.fake).bindings).toContainEqual({
      type: "secret_text",
      name: "MGMT_SECRET",
      text: "secret-from-first-run",
    })
    const secretStep = finishedStep(second.events, "set-mgmt-secret")
    expect(secretStep?.message).toBe("Reused the existing management secret")
  })

  it("applies only the migrations that are not yet recorded", async () => {
    const migrations = [
      { name: "0001_init.sql", sql: "CREATE TABLE IF NOT EXISTS publications (token TEXT PRIMARY KEY);" },
      { name: "0002_extra.sql", sql: "CREATE TABLE IF NOT EXISTS extra (id TEXT PRIMARY KEY);" },
    ]
    const { fake, events, error } = await run({
      artifact: artifact(migrations),
      fake: {
        databases: [{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }],
        migrationRows: [{ name: "0001_init.sql", applied_at: NOW.toISOString() }],
      },
    })

    expect(error).toBeNull()
    expect(fake.state.executedSql).toEqual([migrations[1].sql])
    expect(fake.state.migrationRows.map((row) => row.name)).toEqual([
      "0001_init.sql",
      "0002_extra.sql",
    ])
    const step = finishedStep(events, "apply-migrations")
    expect(step?.message).toContain("0002_extra.sql")
  })

  it("preserves provisioned_at and refreshes updated_at on upgrade", async () => {
    const earlier = "2026-01-01T00:00:00.000Z"
    const first = await run()
    const record = first.store.read()
    if (!record) throw new Error("expected a record")

    const second = await run({
      store: memoryStore({ ...record, provisioned_at: earlier, updated_at: earlier }),
      fake: {
        databases: [{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }],
        buckets: [CLOUDFLARE_R2_BUCKET_NAME],
        scripts: [CLOUDFLARE_WORKER_NAME],
        migrationRows: [{ name: "0001_init.sql", applied_at: earlier }],
      },
    })

    expect(second.store.read()?.provisioned_at).toBe(earlier)
    expect(second.store.read()?.updated_at).toBe(NOW.toISOString())
  })
})

describe("provisionCloudflare — error taxonomy", () => {
  it("reports bad_token_scope with the exact missing scopes", async () => {
    const { error, events } = await run({ fake: { denyScopes: ["D1:Edit", "R2:Edit"] } })

    expect(error?.code).toBe("bad_token_scope")
    expect(error?.missingScopes).toEqual(["D1:Edit", "R2:Edit"])
    expect(error?.resumeFromStep).toBe(1)
    expect(error?.message).toContain("D1:Edit, R2:Edit")
    expect(stepEvents(events).at(-1)).toMatchObject({ id: "verify-token", status: "error" })
  })

  it("reports bad_token_scope when the token itself is rejected", async () => {
    const { error } = await run({ fake: { tokenInvalid: true } })
    expect(error?.code).toBe("bad_token_scope")
    expect(error?.missingScopes).toEqual([
      "Account:Read",
      "Workers Scripts:Edit",
      "D1:Edit",
      "R2:Edit",
    ])
  })

  it("reports account_not_found for an unknown account id", async () => {
    const { error } = await run({ fake: { accountMissing: true } })
    expect(error?.code).toBe("account_not_found")
    expect(error?.resumeFromStep).toBe(1)
  })

  it("reports name_collision when D1 create conflicts with an invisible database", async () => {
    const { error } = await run({ fake: { d1CreateConflict: true } })
    expect(error?.code).toBe("name_collision")
    expect(error?.resumeFromStep).toBe(2)
    expect(error?.message).toContain(CLOUDFLARE_D1_DATABASE_NAME)
  })

  it("reports migration_failed with the offending file name", async () => {
    const { error } = await run({ fake: { migrationErrorMessage: "near \"CREATE\": syntax error" } })
    expect(error?.code).toBe("migration_failed")
    expect(error?.resumeFromStep).toBe(3)
    expect(error?.message).toContain("0001_init.sql")
  })

  it("treats an existing R2 bucket as success", async () => {
    const { error, events } = await run({ fake: { bucketCreateConflict: true } })
    expect(error).toBeNull()
    const step = finishedStep(events, "find-or-create-r2")
    expect(step?.message).toContain("Reusing bucket")
  })

  it("reports upload_failed when the script upload is rejected", async () => {
    const { error } = await run({ fake: { uploadErrorMessage: "script exceeded size limit" } })
    expect(error?.code).toBe("upload_failed")
    expect(error?.resumeFromStep).toBe(5)
    expect(error?.message).toContain("size limit")
  })

  it("retries the upload without the DO migration when the tag was already applied", async () => {
    const { error, fake } = await run({ fake: { rejectMigrationTag: true } })
    expect(error).toBeNull()
    expect(fake.state.uploadCount).toBe(1)
    expect(uploadedMetadata(fake).migrations).toBeUndefined()
  })

  it("reports no_workers_subdomain when the account has none", async () => {
    const { error, fake } = await run({ fake: { subdomain: null } })
    expect(error?.code).toBe("no_workers_subdomain")
    expect(error?.resumeFromStep).toBe(7)
    expect(fake.state.scripts.has(CLOUDFLARE_WORKER_NAME)).toBe(true)
  })

  it("reports stale_deployment when the deployed version does not match", async () => {
    const { error } = await run({ fake: { workerVersion: "0.0.1" } })
    expect(error?.code).toBe("stale_deployment")
    expect(error?.resumeFromStep).toBe(8)
    expect(error?.message).toContain("0.0.1")
  })

  it("reports partial_provision when the worker is not reachable yet", async () => {
    const { error, store } = await run({ fake: { healthUnreachable: true } })
    expect(error?.code).toBe("partial_provision")
    expect(error?.resumeFromStep).toBe(8)
    expect(store.read()).toBeNull()
  })

  it("retries /health with backoff before giving up", async () => {
    const { error, fake } = await run({ fake: { healthFailures: 2 }, healthAttempts: 4 })
    expect(error).toBeNull()
    expect(fake.state.healthCalls).toBe(3)
  })
})

describe("provisionCloudflare — resuming after a partial provision", () => {
  it("completes on the next run without duplicating resources", async () => {
    const store = memoryStore()
    const first = await run({ store, fake: { healthUnreachable: true } })
    expect(first.error?.resumeFromStep).toBe(8)
    expect(store.read()).toBeNull()

    const second = await run({
      store,
      fake: {
        databases: [{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }],
        buckets: [CLOUDFLARE_R2_BUCKET_NAME],
        scripts: [CLOUDFLARE_WORKER_NAME],
        migrationRows: [{ name: "0001_init.sql", applied_at: NOW.toISOString() }],
      },
    })

    expect(second.error).toBeNull()
    expect(second.fake.state.databases).toHaveLength(1)
    expect(second.fake.state.buckets).toHaveLength(1)
    expect(second.fake.state.executedSql).toEqual([])
    expect(store.read()?.mgmt_secret).toBe("mgmt-secret-1")
  })

  it("leaves the stored secret matching the last uploaded secret", async () => {
    const store = memoryStore()
    await run({ store, secret: "secret-a", fake: { subdomain: null } })
    const second = await run({
      store,
      secret: "secret-b",
      fake: {
        databases: [{ uuid: "db-uuid-1", name: CLOUDFLARE_D1_DATABASE_NAME }],
        buckets: [CLOUDFLARE_R2_BUCKET_NAME],
        scripts: [CLOUDFLARE_WORKER_NAME],
        migrationRows: [{ name: "0001_init.sql", applied_at: NOW.toISOString() }],
      },
    })

    expect(store.read()?.mgmt_secret).toBe("secret-b")
    expect(uploadedMetadata(second.fake).bindings).toContainEqual({
      type: "secret_text",
      name: "MGMT_SECRET",
      text: "secret-b",
    })
  })
})
