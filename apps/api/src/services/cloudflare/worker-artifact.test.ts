import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PUBLISH_WORKER_VERSION } from "@adt/types"
import { loadWorkerArtifact, WorkerArtifactError } from "./worker-artifact.js"

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-worker-artifact-"))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeArtifact(version: string): { artifactDir: string; migrationsDir: string } {
  const migrationsDir = path.join(dir, "migrations")
  fs.mkdirSync(migrationsDir, { recursive: true })
  fs.writeFileSync(path.join(migrationsDir, "0001_init.sql"), "SELECT 1;")
  fs.writeFileSync(path.join(dir, "worker.js"), "export default {}")
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({
      version,
      main_module: "worker.js",
      compatibility_date: "2026-07-01",
      bindings: [{ type: "d1", name: "DB" }],
      migrations: { new_tag: "v1", new_sqlite_classes: ["PublicationRoom"] },
      d1_migrations: ["0001_init.sql"],
    }),
  )
  return { artifactDir: dir, migrationsDir }
}

describe("loadWorkerArtifact", () => {
  it("loads an artifact matching the Studio's worker version", () => {
    const artifact = loadWorkerArtifact(writeArtifact(PUBLISH_WORKER_VERSION))
    expect(artifact.metadata.version).toBe(PUBLISH_WORKER_VERSION)
    expect(artifact.migrations).toHaveLength(1)
  })

  it("rejects a stale artifact instead of deploying the old version", () => {
    expect(() => loadWorkerArtifact(writeArtifact("0.0.1"))).toThrowError(WorkerArtifactError)
    expect(() => loadWorkerArtifact(writeArtifact("0.0.1"))).toThrowError(
      /stale.*0\.0\.1.*Rebuild/s,
    )
  })
})
