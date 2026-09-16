import { describe, expect, it } from "vitest"
import { CLOUDFLARE_WORKER_NAME } from "@adt/types"
import { bookWorkerName } from "./book-host.js"
import {
  BookHostDeployError,
  deployBookHost,
  resolveBookHostBindings,
} from "./book-host-deploy.js"
import { createCloudflareClient } from "./client.js"
import { createFakeCloudflare } from "./fake-cloudflare-api.js"
import { staticAssetHash } from "./static-assets.js"
import type { BookHostArtifact } from "./worker-artifact.js"

const encoder = new TextEncoder()
const TOKEN = "bookHostDeployTokenAbcdefghijk12"

const ARTIFACT: BookHostArtifact = {
  script: "export default { fetch() {} }",
  metadata: {
    version: "0.13.0",
    main_module: "book-host.js",
    compatibility_date: "2026-07-01",
    bindings: [
      { type: "d1", name: "DB" },
      { type: "assets", name: "ASSETS" },
      { type: "durable_object_namespace", name: "PUBLICATION_ROOM", class_name: "PublicationRoom" },
    ],
    d1_migrations: [],
  },
}

const ASSETS = [
  { path: "/uploads/one/index.html", content: encoder.encode("<h1>page one</h1>") },
  { path: "/uploads/one/images/cover.png", content: encoder.encode("fake-png") },
]

function deploy(fake: ReturnType<typeof createFakeCloudflare>, overrides = {}) {
  return deployBookHost({
    client: createCloudflareClient({
      token: "account-token",
      accountId: "acct-1",
      fetchFn: fake.fetchFn,
    }),
    artifact: ARTIFACT,
    token: TOKEN,
    assets: ASSETS,
    d1DatabaseUuid: "db-uuid-1",
    workersDevSubdomain: "teacher",
    ...overrides,
  })
}

describe("resolveBookHostBindings", () => {
  /** The class stays declared once, on the control plane. Free allows 100 Durable Object
   *  classes and 100 Workers, so a class per book would reach both caps at the same book. */
  it("binds the room across scripts rather than declaring it", () => {
    const bindings = resolveBookHostBindings(ARTIFACT.metadata.bindings, {
      d1DatabaseUuid: "db-uuid-1",
      controlPlaneName: CLOUDFLARE_WORKER_NAME,
    })

    expect(bindings).toEqual([
      { type: "d1", name: "DB", id: "db-uuid-1" },
      { type: "assets", name: "ASSETS" },
      {
        type: "durable_object_namespace",
        name: "PUBLICATION_ROOM",
        class_name: "PublicationRoom",
        script_name: CLOUDFLARE_WORKER_NAME,
      },
    ])
  })

  /** A book host serves public reader traffic and has no management route, so a secret
   *  reaching one would be a credential sitting on a public surface. */
  it("refuses to hand a book host a secret", () => {
    expect(() =>
      resolveBookHostBindings(
        [{ type: "secret_text", name: "MGMT_SECRET" }],
        { d1DatabaseUuid: "db-uuid-1", controlPlaneName: CLOUDFLARE_WORKER_NAME },
      ),
    ).toThrow(BookHostDeployError)
  })
})

describe("deployBookHost", () => {
  it("creates the Worker, uploads only this book's assets and routes it", async () => {
    const hashes = ASSETS.map((asset) => staticAssetHash(asset.path, asset.content))
    const fake = createFakeCloudflare({ assetUploadBuckets: [hashes] })

    const deployed = await deploy(fake)

    expect(deployed.workerName).toBe(bookWorkerName(TOKEN))
    expect(deployed.url).toBe(`https://${bookWorkerName(TOKEN)}.teacher.workers.dev`)
    expect(fake.state.subdomainEnabledFor).toEqual([bookWorkerName(TOKEN)])
    expect(Object.keys(fake.state.staticAssetUploads[0] ?? {}).sort()).toEqual([...hashes].sort())
    expect(Object.keys(fake.state.staticAssetManifests[0] ?? {})).toEqual(
      ASSETS.map((asset) => asset.path),
    )
  })

  /** The whole reason for a Worker per book: the gate has to run ahead of every byte, and a
   *  path list would leave anything it does not match publicly readable. */
  it("puts the access gate ahead of every asset", async () => {
    const fake = createFakeCloudflare()
    await deploy(fake)

    const script = fake.state.scripts.get(bookWorkerName(TOKEN))
    const assets = script?.metadata.assets as { config?: Record<string, unknown> }
    expect(assets.config?.run_worker_first).toBe(true)
  })

  it("carries no management secret onto the public host", async () => {
    const fake = createFakeCloudflare()
    await deploy(fake)

    const bindings = fake.state.scripts.get(bookWorkerName(TOKEN))?.metadata.bindings
    expect(JSON.stringify(bindings)).not.toContain("MGMT_SECRET")
  })

  /** Republishing hits an existing Worker. Creation conflicting is the normal path, not a
   *  failure, or the second publish of every book would break. */
  it("redeploys over a Worker that already exists", async () => {
    const fake = createFakeCloudflare({ scripts: [bookWorkerName(TOKEN)] })

    await expect(deploy(fake)).resolves.toMatchObject({ workerName: bookWorkerName(TOKEN) })
  })

  it("names the step that failed when Cloudflare refuses the deployment", async () => {
    const fake = createFakeCloudflare({ assetSessionErrorMessage: "manifest unavailable" })

    await expect(deploy(fake)).rejects.toThrow(/manifest unavailable/)
  })

  it("refuses to deploy a host with nothing to serve", async () => {
    const fake = createFakeCloudflare()

    await expect(deploy(fake, { assets: [] })).rejects.toThrow(BookHostDeployError)
  })
})
