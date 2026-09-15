import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { WorkerArtifactMetadata } from "./worker-artifact.js"

/**
 * Against the artifacts `build:artifact` really emits, not a hand-written fixture.
 *
 * The provisioner uploads exactly what metadata.json declares, so anything the Worker's source
 * assumes and the metadata omits is a binding the deployed Worker silently does without. That
 * had already happened once: the control plane exported `PublicationRoom` and the room routes
 * read `env.PUBLICATION_ROOM`, but the build emitted neither the binding nor the migration, so
 * live presence was a no-op on every real deployment while the suite stayed green against a
 * fixture describing an artifact the build never produced.
 *
 * `pretest` runs `pnpm build`, so both artifacts exist whenever this runs.
 */
const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../apps/publish-service/dist",
)

function metadata(file: string) {
  const parsed = WorkerArtifactMetadata.safeParse(
    JSON.parse(fs.readFileSync(path.join(distDir, file), "utf-8")),
  )
  if (!parsed.success) throw new Error(`${file} is not valid artifact metadata: ${parsed.error}`)
  return parsed.data
}

const bindingNames = (m: ReturnType<typeof metadata>) => m.bindings.map((b) => b.name)

describe("control plane artifact", () => {
  const control = metadata("metadata.json")

  it("declares every binding the Worker's own source reads", () => {
    expect(bindingNames(control)).toEqual(
      expect.arrayContaining(["DB", "ASSETS", "PUBLICATION_ROOM", "MGMT_SECRET"]),
    )
  })

  /** The class has to be declared *somewhere*, and the control plane is the only Worker that
   *  declares it — book hosts bind it across scripts. No migration here means no class at all. */
  it("declares the Durable Object migration that creates the room class", () => {
    expect(control.migrations).toEqual({
      new_tag: expect.any(String),
      new_sqlite_classes: ["PublicationRoom"],
    })
  })

  it("owns the D1 migrations", () => {
    expect(control.d1_migrations.length).toBeGreaterThan(0)
  })
})

describe("book host artifact", () => {
  const bookHost = metadata("book-host-metadata.json")

  it("binds the database, its own assets and the shared room", () => {
    expect(bindingNames(bookHost)).toEqual(["DB", "ASSETS", "PUBLICATION_ROOM"])
  })

  /** A book host serves public reader traffic and has no management route, so the secret would
   *  be a credential sitting on a public surface for no reason. */
  it("carries no management secret", () => {
    expect(bindingNames(bookHost)).not.toContain("MGMT_SECRET")
  })

  /** Workers Free allows 100 Durable Object classes and 100 Workers. One class per book host
   *  would reach both caps at the same book, so book hosts declare none. */
  it("declares no Durable Object class of its own", () => {
    expect(bookHost.migrations).toBeUndefined()
  })

  it("leaves the D1 migrations to the control plane", () => {
    expect(bookHost.d1_migrations).toEqual([])
  })

  it("is its own entry point, not the control plane's", () => {
    expect(bookHost.main_module).toBe("book-host.js")
  })
})
