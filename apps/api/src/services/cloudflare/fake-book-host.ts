import { PUBLISH_WORKER_VERSION } from "@adt/types"
import { createCloudflareClient } from "./client.js"
import { createFakeCloudflare, type FakeCloudflareOptions } from "./fake-cloudflare-api.js"
import type { BookHostDeps } from "../publish-service.js"
import type { BookHostArtifact } from "./worker-artifact.js"

/** Mirrors dist/book-host-metadata.json: no migrations, and a MGMT_SECRET that the
 *  deploy fills with a value derived per book rather than the account's own. The contract test in
 *  worker-artifact.contract.test.ts is what keeps that claim honest against the real build. */
export const FAKE_BOOK_HOST_ARTIFACT: BookHostArtifact = {
  script: "export default { fetch() { return new Response('book host') } }",
  metadata: {
    version: PUBLISH_WORKER_VERSION,
    main_module: "book-host.js",
    compatibility_date: "2026-07-01",
    bindings: [
      { type: "d1", name: "DB" },
      { type: "assets", name: "ASSETS" },
      {
        type: "durable_object_namespace",
        name: "PUBLICATION_ROOM",
        class_name: "PublicationRoom",
      },
      { type: "secret_text", name: "MGMT_SECRET" },
    ],
    d1_migrations: [],
  },
}

/** The bytes a publish actually sent to Cloudflare for one asset path, decoded. The control
 *  plane never sees them any more, so this is where content assertions belong. */
export function uploadedAssetText(
  fake: ReturnType<typeof createFakeCloudflare>,
  assetPath: string,
): string | undefined {
  for (const manifest of fake.state.staticAssetManifests) {
    const entry = manifest[assetPath] as { hash?: string } | undefined
    if (!entry?.hash) continue
    for (const upload of fake.state.staticAssetUploads) {
      const base64 = upload[entry.hash]
      if (base64 !== undefined) return Buffer.from(base64, "base64").toString("utf-8")
    }
  }
  return undefined
}

/**
 * A publish that deploys a real book Worker against the fake Cloudflare API.
 *
 * Tests that only care about the control plane still get a working publish, and tests that
 * care about the deployment can read `fake.state` for the script, its bindings and the assets
 * that were registered.
 */
export function createFakeBookHost(
  options: FakeCloudflareOptions = {},
): { fake: ReturnType<typeof createFakeCloudflare>; deps: BookHostDeps } {
  const fake = createFakeCloudflare({ assetUploadAllBuckets: true, ...options })
  return {
    fake,
    deps: {
      client: createCloudflareClient({
        token: "account-token",
        accountId: options.accountId ?? "acct-1",
        fetchFn: fake.fetchFn,
      }),
      artifact: FAKE_BOOK_HOST_ARTIFACT,
      d1DatabaseUuid: "db-uuid-1",
      workersDevSubdomain: "teacher",
      controlPlaneSecret: "fake-mgmt-secret",
    },
  }
}
