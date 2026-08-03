import fs from "node:fs"
import path from "node:path"
import { z } from "zod"

export const WORKER_ARTIFACT_SCRIPT_FILE = "worker.js"
export const WORKER_ARTIFACT_METADATA_FILE = "metadata.json"
export const WORKER_ARTIFACT_BUILD_COMMAND =
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
  }),
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

export function loadWorkerArtifact(paths: WorkerArtifactPaths): WorkerArtifact {
  const { artifactDir, migrationsDir } = paths
  const scriptPath = path.join(artifactDir, WORKER_ARTIFACT_SCRIPT_FILE)
  const metadataPath = path.join(artifactDir, WORKER_ARTIFACT_METADATA_FILE)

  const missing = [scriptPath, metadataPath].filter((file) => !fs.existsSync(file))
  if (missing.length > 0) {
    throw new WorkerArtifactError(
      `Publish worker artifact is missing (${missing.join(", ")}). ` +
        `Build it with \`${WORKER_ARTIFACT_BUILD_COMMAND}\`, or point ` +
        `PUBLISH_WORKER_ARTIFACT_DIR at a directory containing ` +
        `${WORKER_ARTIFACT_SCRIPT_FILE} and ${WORKER_ARTIFACT_METADATA_FILE}.`,
    )
  }

  const parsedMetadata = WorkerArtifactMetadata.safeParse(
    JSON.parse(fs.readFileSync(metadataPath, "utf-8")),
  )
  if (!parsedMetadata.success) {
    throw new WorkerArtifactError(
      `Publish worker ${WORKER_ARTIFACT_METADATA_FILE} is invalid: ${parsedMetadata.error.message}`,
    )
  }
  const metadata = parsedMetadata.data

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
    script: fs.readFileSync(scriptPath, "utf-8"),
    metadata,
    migrations,
    artifactDir,
    migrationsDir,
  }
}
