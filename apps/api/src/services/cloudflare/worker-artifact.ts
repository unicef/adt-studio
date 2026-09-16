import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { PUBLISH_WORKER_VERSION } from "@adt/types"

const WORKER_ARTIFACT_SCRIPT_FILE = "worker.js"
const WORKER_ARTIFACT_METADATA_FILE = "metadata.json"
const BOOK_HOST_SCRIPT_FILE = "book-host.js"
const BOOK_HOST_METADATA_FILE = "book-host-metadata.json"
const WORKER_ARTIFACT_BUILD_COMMAND =
  "pnpm --filter @adt/publish-service build:artifact"

export const WorkerArtifactBinding = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  class_name: z.string().min(1).optional(),
  description: z.string().optional(),
})
export type WorkerArtifactBinding = z.infer<typeof WorkerArtifactBinding>

export const WorkerArtifactMetadata = z.object({
  version: z.string().min(1),
  main_module: z.string().min(1),
  compatibility_date: z.string().min(1),
  bindings: z.array(WorkerArtifactBinding),
  migrations: z.object({
    new_tag: z.string().min(1),
    new_sqlite_classes: z.array(z.string().min(1)),
  }).optional(),
  d1_migrations: z.array(z.string().min(1)).default([]),
})
export type WorkerArtifactMetadata = z.infer<typeof WorkerArtifactMetadata>

export interface WorkerMigrationFile {
  name: string
  sql: string
}

export interface WorkerArtifact {
  script: string
  metadata: WorkerArtifactMetadata
  migrations: WorkerMigrationFile[]
  artifactDir: string
  migrationsDir: string
}

export class WorkerArtifactError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkerArtifactError"
  }
}

export interface WorkerArtifactPaths {
  artifactDir: string
  migrationsDir: string
}

export function resolveWorkerArtifactPaths(
  projectRoot: string,
  overrides: Partial<WorkerArtifactPaths> = {},
): WorkerArtifactPaths {
  const artifactDir = path.resolve(
    overrides.artifactDir ??
      process.env.PUBLISH_WORKER_ARTIFACT_DIR ??
      path.join(projectRoot, "apps", "publish-service", "dist"),
  )

  const packagedMigrations = path.join(artifactDir, "migrations")
  const migrationsDir = path.resolve(
    overrides.migrationsDir ??
      process.env.PUBLISH_WORKER_MIGRATIONS_DIR ??
      (fs.existsSync(packagedMigrations)
        ? packagedMigrations
        : path.join(artifactDir, "..", "migrations")),
  )

  return { artifactDir, migrationsDir }
}

/** Reads and validates one script/metadata pair. Shared so the book host cannot drift into a
 * different staleness check than the control plane — deploying a v0.13 book host against a
 * v0.14 control plane would fail its health check for reasons that look like anything but a
 * version mismatch. */
function readArtifact(
  artifactDir: string,
  scriptFile: string,
  metadataFile: string,
): { script: string; metadata: WorkerArtifactMetadata } {
  const scriptPath = path.join(artifactDir, scriptFile)
  const metadataPath = path.join(artifactDir, metadataFile)

  const missing = [scriptPath, metadataPath].filter((file) => !fs.existsSync(file))
  if (missing.length > 0) {
    throw new WorkerArtifactError(
      `Publish worker artifact is missing (${missing.join(", ")}). ` +
        `Build it with \`${WORKER_ARTIFACT_BUILD_COMMAND}\`, or point ` +
        `PUBLISH_WORKER_ARTIFACT_DIR at a directory containing ` +
        `${scriptFile} and ${metadataFile}.`,
    )
  }

  const parsed = WorkerArtifactMetadata.safeParse(
    JSON.parse(fs.readFileSync(metadataPath, "utf-8")),
  )
  if (!parsed.success) {
    throw new WorkerArtifactError(
      `Publish worker ${metadataFile} is invalid: ${parsed.error.message}`,
    )
  }

  if (parsed.data.version !== PUBLISH_WORKER_VERSION) {
    throw new WorkerArtifactError(
      `Publish worker artifact is stale: it was built as v${parsed.data.version} but this ` +
        `Studio ships v${PUBLISH_WORKER_VERSION}. Uploading it would deploy the old version ` +
        `and the install would fail its final check. Rebuild it with ` +
        `\`${WORKER_ARTIFACT_BUILD_COMMAND}\` (restarting \`pnpm dev\` also rebuilds it), ` +
        `then try again.`,
    )
  }

  return { script: fs.readFileSync(scriptPath, "utf-8"), metadata: parsed.data }
}

export interface BookHostArtifact {
  script: string
  metadata: WorkerArtifactMetadata
}

/**
 * The per-book host. No migrations of its own: it declares no Durable Object class and the
 * control plane owns the D1 database, so there is nothing for a book publish to apply.
 */
export function loadBookHostArtifact(artifactDir: string): BookHostArtifact {
  return readArtifact(artifactDir, BOOK_HOST_SCRIPT_FILE, BOOK_HOST_METADATA_FILE)
}

export function loadWorkerArtifact(paths: WorkerArtifactPaths): WorkerArtifact {
  const { artifactDir, migrationsDir } = paths
  const { script, metadata } = readArtifact(
    artifactDir,
    WORKER_ARTIFACT_SCRIPT_FILE,
    WORKER_ARTIFACT_METADATA_FILE,
  )

  const migrationNames =
    metadata.d1_migrations.length > 0
      ? metadata.d1_migrations
      : fs.existsSync(migrationsDir)
        ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()
        : []

  if (migrationNames.length === 0) {
    throw new WorkerArtifactError(
      `No D1 migrations found for the publish worker (looked in ${migrationsDir}). ` +
        `Set PUBLISH_WORKER_MIGRATIONS_DIR if the migrations ship elsewhere.`,
    )
  }

  const migrations = migrationNames.map((name) => {
    const migrationPath = path.join(migrationsDir, name)
    if (!fs.existsSync(migrationPath)) {
      throw new WorkerArtifactError(
        `Migration ${name} listed in ${WORKER_ARTIFACT_METADATA_FILE} is missing from ${migrationsDir}.`,
      )
    }
    return { name, sql: fs.readFileSync(migrationPath, "utf-8") }
  })

  return {
    script,
    metadata,
    migrations,
    artifactDir,
    migrationsDir,
  }
}
