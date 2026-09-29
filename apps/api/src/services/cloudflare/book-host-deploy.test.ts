import { describe, expect, it } from "vitest"
import { CLOUDFLARE_WORKER_NAME } from "@adt/types"
import { bookHostAuthorSecret, bookWorkerName } from "./book-host.js"
import {
  BookHostDeployError,
  MAX_LIVE_BOOK_HOSTS,
  deployBookHost,
  resolveBookHostBindings,
} from "./book-host-deploy.js"
import { createCloudflareClient } from "./client.js"
import { createFakeCloudflare } from "./fake-cloudflare-api.js"
import { staticAssetHash } from "./static-assets.js"
import type { BookHostArtifact } from "./worker-artifact.js"

const encoder = new TextEncoder()
const TOKEN = "bookHostDeployTokenAbcdefghijk12"
const CONTROL_PLANE_SECRET = "control-plane-mgmt-secret"

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
      { type: "secret_text", name: "MGMT_SECRET" },
    ],
    d1_migrations: [],
    assets: { config: { html_handling: "none", not_found_handling: "none" } },
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
    controlPlaneSecret: CONTROL_PLANE_SECRET,
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
      authorSecret: "derived-secret",
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
      { type: "secret_text", name: "MGMT_SECRET", text: "derived-secret" },
    ])
  })

  /** Anything the book host was not designed to hold is a mistake worth failing on rather than
   *  forwarding to a public Worker. */
  it("refuses a binding a book host has no business carrying", () => {
    expect(() =>
      resolveBookHostBindings(
        [{ type: "kv_namespace", name: "SESSIONS" }],
        {
          d1DatabaseUuid: "db-uuid-1",
          controlPlaneName: CLOUDFLARE_WORKER_NAME,
          authorSecret: "derived-secret",
        },
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

  it("retries a transient Worker deployment without recreating the book host", async () => {
    const fake = createFakeCloudflare()
    let rejected = false
    const fetchFn = async (url: string, init?: RequestInit) => {
      if (!rejected && init?.method === "PUT" && url.includes(`/workers/scripts/${bookWorkerName(TOKEN)}`)) {
        rejected = true
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 10001, message: "temporarily unavailable" }] }),
          { status: 503, headers: { "Retry-After": "0" } },
        )
      }
      return fake.fetchFn(url, init)
    }

    await deploy(fake, {
      client: createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn }),
      sleep: async () => undefined,
    })

    expect(rejected).toBe(true)
    expect(fake.state.scripts.has(bookWorkerName(TOKEN))).toBe(true)
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

  /** `run_worker_first` decides *who answers*; this decides *what the asset layer does once it
   *  answers*. Left at Cloudflare's default the layer 307s `.../index.html` to the directory
   *  form, and `serveSnapshot` forwards every non-404 — so the reader was redirected to the
   *  internal `/uploads/<uploadId>/` path and the book opened as `{"error":"not_found"}`. */
  it("tells the asset layer to serve the exact path rather than redirect", async () => {
    const fake = createFakeCloudflare()
    await deploy(fake)

    const script = fake.state.scripts.get(bookWorkerName(TOKEN))
    const assets = script?.metadata.assets as { config?: Record<string, unknown> }
    expect(assets.config?.html_handling).toBe("none")
    expect(assets.config?.not_found_handling).toBe("none")
  })

  /** The account's secret authorises every management call on the control plane. Handing the
   *  same value to a public per-book Worker would mean any one of ~99 of them leaking it costs
   *  the whole account, so what ships is derived from it and scoped to this book. */
  it("never puts the account\u2019s own secret on a book host", async () => {
    const fake = createFakeCloudflare()
    await deploy(fake)

    const bindings = JSON.stringify(
      fake.state.scripts.get(bookWorkerName(TOKEN))?.metadata.bindings,
    )
    expect(bindings).not.toContain(CONTROL_PLANE_SECRET)
    expect(bindings).toContain(bookHostAuthorSecret(CONTROL_PLANE_SECRET, TOKEN))
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

  /** Reaching the cap used to surface as whatever Cloudflare says when a Worker create is
   *  refused — after the author had waited through a whole export. */
  it("says the account is full before doing any of the work", async () => {
    const full = Array.from(
      { length: MAX_LIVE_BOOK_HOSTS },
      (_, index) => `adt-book-${String(index).padStart(32, "0")}`,
    )
    const fake = createFakeCloudflare({ scripts: [CLOUDFLARE_WORKER_NAME, ...full] })

    await expect(deploy(fake)).rejects.toThrow(/as many as the free plan allows/)
    expect(fake.state.staticAssetManifests).toEqual([])
  })

  /** Republishing an existing book is not a new slot, so a full account must not block it. */
  it("still updates a book that already has a host when the account is full", async () => {
    const full = Array.from(
      { length: MAX_LIVE_BOOK_HOSTS - 1 },
      (_, index) => `adt-book-${String(index).padStart(32, "0")}`,
    )
    const fake = createFakeCloudflare({
      scripts: [CLOUDFLARE_WORKER_NAME, bookWorkerName(TOKEN), ...full],
    })

    await expect(deploy(fake)).resolves.toMatchObject({ workerName: bookWorkerName(TOKEN) })
  })

  it("refuses to deploy a host with nothing to serve", async () => {
    const fake = createFakeCloudflare()

    await expect(deploy(fake, { assets: [] })).rejects.toThrow(BookHostDeployError)
  })
})
