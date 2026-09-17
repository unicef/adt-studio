import { describe, expect, it } from "vitest"
import {
  StaticAssetError,
  createStaticAssetManifest,
  createStaticAssetUploadPayloads,
  prepareStaticAssets,
  staticAssetHash,
} from "./static-assets.js"
import { createCloudflareClient } from "./client.js"
import { createFakeCloudflare } from "./fake-cloudflare-api.js"

const encoder = new TextEncoder()

describe("static asset manifest", () => {
  it("uses Cloudflare's content and extension hash and keeps asset paths absolute", () => {
    const content = encoder.encode("<h1>hello</h1>")
    const hash = staticAssetHash("/books/raven/index.html", content)
    expect(hash).toHaveLength(32)
    expect(createStaticAssetManifest([{ path: "/books/raven/index.html", content }])).toEqual({
      "/books/raven/index.html": { hash, size: content.byteLength },
    })
  })

  it("builds each requested hash bucket as the base64 upload body", () => {
    const index = encoder.encode("index")
    const image = encoder.encode("image")
    const assets = [
      { path: "/books/raven/index.html", content: index },
      { path: "/books/raven/cover.png", content: image },
    ]
    const [indexHash, imageHash] = assets.map((asset) => staticAssetHash(asset.path, asset.content))

    expect(createStaticAssetUploadPayloads([[imageHash, indexHash]], assets)).toEqual([{
      [imageHash]: Buffer.from(image).toString("base64"),
      [indexHash]: Buffer.from(index).toString("base64"),
    }])
  })

  it("rejects unsafe paths, duplicate paths and unexpected upload requests", () => {
    const content = encoder.encode("x")
    expect(() => createStaticAssetManifest([{ path: "index.html", content }])).toThrow(StaticAssetError)
    expect(() => createStaticAssetManifest([
      { path: "/index.html", content },
      { path: "/index.html", content },
    ])).toThrow("Duplicate")
    expect(() => createStaticAssetUploadPayloads([["unknown"]], [{ path: "/index.html", content }]))
      .toThrow("unknown asset hash")
  })

  it("keeps the initial JWT when all of the collection is already available", async () => {
    const fake = createFakeCloudflare()
    const client = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: fake.fetchFn })

    const prepared = await prepareStaticAssets(client, "adt-publish", [
      { path: "/uploads/one/index.html", content: encoder.encode("one") },
    ])

    expect(prepared.completionJwt).toBe("asset-upload-jwt")
    expect(fake.state.staticAssetUploads).toEqual([])
  })

  it("uses the completion JWT returned by each Cloudflare asset bucket", async () => {
    const content = encoder.encode("one")
    const hash = staticAssetHash("/uploads/one/index.html", content)
    const fake = createFakeCloudflare({ assetUploadBuckets: [[hash]] })
    const client = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: fake.fetchFn })

    const prepared = await prepareStaticAssets(client, "adt-publish", [
      { path: "/uploads/one/index.html", content },
    ])

    expect(prepared.completionJwt).toBe("asset-complete-jwt")
    expect(fake.state.staticAssetUploads).toHaveLength(1)
    expect(fake.state.bearerTokens).toEqual(["account-token", "asset-upload-jwt"])
  })
})
