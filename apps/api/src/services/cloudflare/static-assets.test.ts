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

  it("uploads an empty file when Cloudflare requests its hash", () => {
    const content = new Uint8Array()
    const hash = staticAssetHash("/__adt_publish_bootstrap", content)

    expect(createStaticAssetUploadPayloads([[hash]], [
      { path: "/__adt_publish_bootstrap", content },
    ])).toEqual([{ [hash]: "" }])
  })

  /**
   * Books repeat content constantly: the same narration serves a paragraph and its easy-read
   * version, an identical images.json ships in every locale. A real 2,530-file export has 119
   * such groups. They hash to one content address on purpose — that is what lets Cloudflare
   * ask only for what it lacks — and treating the second one as a collision refused to publish
   * the book at all.
   */
  it("sends repeated content once instead of refusing it", () => {
    const audio = encoder.encode("identical narration bytes")
    const assets = [
      { path: "/audio/pg001_n0018.mp3", content: audio },
      { path: "/audio/pg001_n0018_easy_read.mp3", content: audio },
      { path: "/audio/other.mp3", content: encoder.encode("different") },
    ]

    const manifest = createStaticAssetManifest(assets)
    expect(manifest["/audio/pg001_n0018.mp3"]?.hash)
      .toBe(manifest["/audio/pg001_n0018_easy_read.mp3"]?.hash)

    const hashes = [...new Set(Object.values(manifest).map((entry) => entry.hash))]
    expect(hashes).toHaveLength(2)

    const [payload] = createStaticAssetUploadPayloads([hashes], assets)
    expect(Object.keys(payload ?? {})).toHaveLength(2)
    expect(payload?.[hashes[0] as string]).toBe(Buffer.from(audio).toString("base64"))
  })

  /** Cloudflare asks only for the addresses it does not already hold, so encoding the whole
   *  book up front builds hundreds of megabytes of base64 to send a handful of files. */
  it("encodes only what Cloudflare asked for", () => {
    const assets = Array.from({ length: 50 }, (_, index) => ({
      path: `/page-${index}.html`,
      content: encoder.encode(`page ${index}`),
    }))
    const wanted = staticAssetHash(assets[7]!.path, assets[7]!.content)

    const [payload] = createStaticAssetUploadPayloads([[wanted]], assets)

    expect(Object.keys(payload ?? {})).toEqual([wanted])
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
    expect(fake.state.staticAssetUploads).toEqual([{ [hash]: Buffer.from(content).toString("base64") }])
    expect(fake.state.bearerTokens).toEqual(["account-token", "asset-upload-jwt"])
  })

  /** The publish Worker re-derives every content type from the snapshot path, so an asset that
   * arrives carrying its own type gives the deployment a second answer that can contradict the
   * one readers get. Cloudflare reads `application/null` as "serve this with no Content-Type". */
  it("uploads each asset with no content type of its own", async () => {
    const content = encoder.encode("one")
    const hash = staticAssetHash("/uploads/one/index.html", content)
    const fake = createFakeCloudflare({ assetUploadBuckets: [[hash]] })
    const client = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: fake.fetchFn })

    await prepareStaticAssets(client, "adt-publish", [
      { path: "/uploads/one/index.html", content },
    ])

    expect(fake.state.staticAssetUploadPartTypes).toEqual([{ [hash]: "application/null" }])
  })

  /**
   * A book large enough to be split across buckets, which is every real one: `triste` is 2,403
   * addresses over five.
   *
   * Two things only show up here. Cloudflare issues the completion token once the collection is
   * whole, so every earlier bucket answers `202 Accepted` carrying nothing — and each bucket is
   * authorised with the session's token, not the previous response's. A suite where every book
   * fitted in one bucket could not tell either apart.
   */
  it("uploads a collection split across several buckets", async () => {
    const assets = Array.from({ length: 6 }, (_, index) => ({
      path: `/uploads/one/page-${index}.html`,
      content: encoder.encode(`page ${index}`),
    }))
    const hashes = assets.map((asset) => staticAssetHash(asset.path, asset.content))
    const buckets = [hashes.slice(0, 2), hashes.slice(2, 4), hashes.slice(4)]
    const fake = createFakeCloudflare({ assetUploadBuckets: buckets })
    const client = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: fake.fetchFn })

    const progress: Array<{ done: number; total: number }> = []
    const prepared = await prepareStaticAssets(client, "adt-publish", assets, {
      onProgress: (event) => progress.push(event),
    })

    expect(prepared.completionJwt).toBe("asset-complete-jwt")
    expect(fake.state.staticAssetUploads).toHaveLength(3)
    expect(fake.state.staticAssetUploads.flatMap((upload) => Object.keys(upload)).sort())
      .toEqual([...hashes].sort())
    /** The account token opens the session; every bucket after that presents the session's
     *  own token, never a token minted by the previous bucket. */
    expect(fake.state.bearerTokens).toEqual([
      "account-token",
      "asset-upload-jwt",
      "asset-upload-jwt",
      "asset-upload-jwt",
    ])
    expect(progress).toEqual([
      { done: 2, total: 6 },
      { done: 4, total: 6 },
      { done: 6, total: 6 },
    ])
  })

  /** A book goes up in bucket-sized pieces over minutes, so one gateway hiccup partway
   *  through would otherwise discard every piece already accepted. Cloudflare's own uploader
   *  allows five attempts per bucket for the same reason. */
  it("retries a bucket Cloudflare temporarily refuses", async () => {
    const content = encoder.encode("one")
    const hash = staticAssetHash("/uploads/one/index.html", content)
    const fake = createFakeCloudflare({
      assetUploadBuckets: [[hash]],
      assetUploadTransientFailures: 2,
    })
    const client = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: fake.fetchFn })

    const prepared = await prepareStaticAssets(
      client,
      "adt-publish",
      [{ path: "/uploads/one/index.html", content }],
      { sleep: async () => {} },
    )

    expect(prepared.completionJwt).toBe("asset-complete-jwt")
    expect(fake.state.staticAssetUploads).toHaveLength(1)
  })

  /** Retrying a request Cloudflare will refuse identically however often it is sent only makes
   *  the author wait longer for the same answer. */
  it("does not retry a batch Cloudflare refuses outright", async () => {
    const content = encoder.encode("one")
    const hash = staticAssetHash("/uploads/one/index.html", content)
    const fake = createFakeCloudflare({
      assetUploadBuckets: [[hash]],
      assetUploadErrorMessage: "asset upload unavailable",
    })
    const client = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: fake.fetchFn })

    await expect(prepareStaticAssets(client, "adt-publish", [
      { path: "/uploads/one/index.html", content },
    ], { sleep: async () => {} })).rejects.toThrow("asset upload unavailable")
  })

  it("identifies whether Cloudflare rejected the manifest or an asset batch", async () => {
    const manifestFailure = createFakeCloudflare({ assetSessionErrorMessage: "manifest unavailable" })
    const manifestClient = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: manifestFailure.fetchFn })
    await expect(prepareStaticAssets(manifestClient, "adt-publish", [
      { path: "/index.html", content: encoder.encode("one") },
    ])).rejects.toThrow("static asset manifest: manifest unavailable")

    const content = encoder.encode("one")
    const hash = staticAssetHash("/index.html", content)
    const uploadFailure = createFakeCloudflare({
      assetUploadBuckets: [[hash]],
      assetUploadErrorMessage: "asset upload unavailable",
    })
    const uploadClient = createCloudflareClient({ token: "account-token", accountId: "acct-1", fetchFn: uploadFailure.fetchFn })
    await expect(prepareStaticAssets(uploadClient, "adt-publish", [
      { path: "/index.html", content },
    ])).rejects.toThrow("static asset batch 1 of 1: asset upload unavailable")
  })
})
