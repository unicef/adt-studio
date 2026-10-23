import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { ImageCapabilities, LocalizedText, ProviderManifest } from "@adt/types"

import { generateImageWithCache } from "../image.js"
import { computeHash } from "../cache.js"
import { createProviderRegistry } from "../registry.js"
import { AiProviderError } from "../ports/errors.js"
import type { AnyProviderModule, ImageResult, ProviderModule } from "../ports/index.js"
import { jpg, png } from "./image-fixtures.js"

const label: LocalizedText = {
  en: "API key",
  "pt-BR": "Chave de API",
  es: "Clave de API",
  fr: "Clé d'API",
  sq: "Kyçi API",
}

function makeImageProvider(options: {
  id: string
  capabilities: ImageCapabilities
  configurableOrigin?: boolean
  generate: (prompt: string) => ImageResult
  edit?: (prompt: string) => ImageResult
}): AnyProviderModule {
  const manifest: ProviderManifest = {
    id: options.id,
    displayName: options.id,
    modalities: ["image"],
    credentialFields: [
      {
        key: "apiKey",
        kind: "secret",
        label,
        required: false,
        header: `X-ADT-Provider-${options.id}-Key`,
        legacyHeaders: [],
        storageKey: `adt-studio-${options.id}-key`,
        legacyStorageKeys: [],
      },
    ],
    capabilities: { image: options.capabilities },
    defaultModels: { image: "fake-image-1" },
  }
  const module: ProviderModule<{ apiKey: string }> = {
    manifest,
    credentialSchema: z.object({ apiKey: z.string().optional().default("") }) as never,
    cacheFingerprint: () => ({
      adapterVersion: `${options.id}-1`,
      origin: `https://${options.id}.test`,
      ...(options.configurableOrigin ? { configurableOrigin: true } : {}),
    }),
    createImageBackend: () => {
      const backend: { generate: (r: { prompt: string }) => Promise<ImageResult>; edit?: (r: { prompt: string }) => Promise<ImageResult> } = {
        generate: async ({ prompt }) => options.generate(prompt),
      }
      if (options.edit) backend.edit = async ({ prompt }) => options.edit!(prompt)
      return backend as never
    },
  }
  return module as AnyProviderModule
}

describe("generateImageWithCache", () => {
  let cacheDir: string
  const fetchMock = vi.fn()

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-image-cache-"))
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it("caches generation results for identical prompts", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: png }],
        }),
        { status: 200 }
      )
    )

    const first = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-2",
      prompt: "a bright diagram",
      size: "1024x1024",
      cacheDir,
    })

    const second = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-2",
      prompt: "a bright diagram",
      size: "1024x1024",
      cacheDir,
    })

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.base64).toBe(first.base64)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/generations")
    await expect(generateImageWithCache({ apiKey: "sk-test", modelId: "openai:gpt-image-2",
      prompt: "a bright diagram", size: "1024x1024", cacheDir, signal: AbortSignal.abort(),
    })).rejects.toMatchObject({ name: "AbortError" })
  })

  it("does not send response_format to /images/generations", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: png }],
        }),
        { status: 200 }
      )
    )

    await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-2",
      prompt: "a bright diagram",
      size: "1024x1024",
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).not.toHaveProperty("response_format")
    expect(body.model).toBe("gpt-image-2")
    expect(body.output_format).toBe("png")
  })

  it("uses the image edits endpoint when reference images are provided", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: png }],
        }),
        { status: 200 }
      )
    )

    const result = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-2",
      prompt: "make it cleaner",
      size: "1024x1024",
      referenceImages: [
        {
          data: Buffer.from("reference-image"),
          name: "reference.png",
        },
      ],
    })

    expect(result.mimeType).toBe("image/png")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/edits")
  })

  it("throws a typed error for a provider without the image modality", async () => {
    await expect(
      generateImageWithCache({
        modelId: "anthropic:claude-sonnet-5",
        prompt: "a diagram",
        cacheDir,
      })
    ).rejects.toMatchObject({
      name: "AiProviderError",
      code: "unsupported-modality",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("promotes a legacy v1 cache entry to v2 for a fixed-origin provider", async () => {
    const stored = { base64: png, mimeType: "image/png" }
    const messages = [
      { role: "user", content: [{ type: "text", text: "legacy prompt" }] },
    ]
    const legacyHash = computeHash({
      modelId: "openai:gpt-image-2",
      messages: messages as never,
      schema: { type: "image-generation", size: "1024x1024", referenceImageCount: 0 },
    })
    fs.writeFileSync(path.join(cacheDir, `${legacyHash}.json`), JSON.stringify(stored))

    const result = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-2",
      prompt: "legacy prompt",
      size: "1024x1024",
      cacheDir,
    })

    expect(result.cached).toBe(true)
    expect(result.base64).toBe(stored.base64)
    expect(fetchMock).not.toHaveBeenCalled()
    // The legacy entry plus the promoted v2 entry now sit side by side.
    expect(fs.readdirSync(cacheDir).length).toBe(2)
  })

  it("skips the legacy cache for a configurable-origin provider", async () => {
    const registry = createProviderRegistry()
      .register(
        makeImageProvider({
          id: "localimg",
          capabilities: { generate: true, edit: false, sizes: [], mimeTypes: [] },
          configurableOrigin: true,
          generate: () => ({ base64: png, mimeType: "image/png" }),
        })
      )
      .freeze()

    const messages = [{ role: "user", content: [{ type: "text", text: "hi" }] }]
    const legacyHash = computeHash({
      modelId: "localimg:fake-image-1",
      messages: messages as never,
      schema: { type: "image-generation", size: undefined, referenceImageCount: 0 },
    })
    fs.writeFileSync(
      path.join(cacheDir, `${legacyHash}.json`),
      JSON.stringify({ base64: Buffer.from("legacy").toString("base64"), mimeType: "image/png" })
    )

    const result = await generateImageWithCache({
      registry,
      modelId: "localimg:fake-image-1",
      prompt: "hi",
      cacheDir,
    })

    expect(result.cached).toBe(false)
    expect(result.base64).toBe(png)
  })

  it("rejects an edit request when the provider lacks the edit capability", async () => {
    const registry = createProviderRegistry()
      .register(
        makeImageProvider({
          id: "genonly",
          capabilities: { generate: true, edit: false, sizes: [], mimeTypes: [] },
          generate: () => ({ base64: Buffer.from("x").toString("base64"), mimeType: "image/png" }),
        })
      )
      .freeze()

    await expect(
      generateImageWithCache({
        registry,
        modelId: "genonly:fake-image-1",
        prompt: "make it cleaner",
        referenceImages: [{ data: Buffer.from("ref") }],
        cacheDir,
      })
    ).rejects.toMatchObject({
      name: "AiProviderError",
      code: "unsupported-capability",
    })
  })

  it("does not cache or log success for invalid output, and a retry can recover", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ b64_json: "broken" }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ b64_json: png }] }))
    const onLog = vi.fn()
    const options = { apiKey: "fake", modelId: "openai:gpt-image-2", prompt: "retry", cacheDir, onLog,
      log: { taskType: "image-generation", promptName: "test" } }
    await expect(generateImageWithCache(options)).rejects.toThrow()
    expect(fs.readdirSync(cacheDir)).toEqual([])
    expect(onLog.mock.calls[0][0].success).toBe(false)
    expect(await generateImageWithCache(options)).toMatchObject({ width: 4, height: 6, cached: false })
  })

  it.each(["v1", "v2"])("ignores invalid %s cache entries and fetches a valid replacement", async (version) => {
    fetchMock.mockImplementation(async () => Response.json({ data: [{ b64_json: png }] }))
    const options = { apiKey: "fake", modelId: "openai:gpt-image-2", prompt: "recover", cacheDir }
    if (version === "v2") {
      await generateImageWithCache(options)
    } else {
      const hash = computeHash({ modelId: options.modelId,
        messages: [{ role: "user", content: [{ type: "text", text: options.prompt }] }],
        schema: { type: "image-generation", size: undefined, referenceImageCount: 0 } })
      fs.writeFileSync(path.join(cacheDir, `${hash}.json`), "{}")
    }
    const file = fs.readdirSync(cacheDir)[0]
    fs.writeFileSync(path.join(cacheDir, file), JSON.stringify({ base64: "broken", mimeType: "image/png" }))
    fetchMock.mockClear()
    expect((await generateImageWithCache(options)).cached).toBe(false)
    expect((await generateImageWithCache(options)).cached).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([16 / 9, 9 / 16, 4 / 3, 8, 1 / 8])("selects a valid GPT Image 2 size for ratio %s", async (aspectRatio) => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ b64_json: png }] }))
    await generateImageWithCache({ apiKey: "fake", modelId: "openai:gpt-image-2", prompt: "wide", aspectRatio })
    const [width, height] = JSON.parse(fetchMock.mock.calls[0][1].body).size.split("x").map(Number)
    expect(width % 16).toBe(0)
    expect(height % 16).toBe(0)
    expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(3)
    expect(width * height).toBeGreaterThanOrEqual(655_360)
    expect(width * height).toBeLessThanOrEqual(8_294_400)
    expect(width / height).toBeCloseTo(Math.max(1 / 3, Math.min(3, aspectRatio)), 1)
  })

  it("keeps legacy model sizes and does not force a size on source edits", async () => {
    fetchMock.mockImplementation(async () => Response.json({ data: [{ b64_json: png }] }))
    await generateImageWithCache({ apiKey: "fake", modelId: "openai:gpt-image-1", prompt: "wide", aspectRatio: 16 / 9, size: "1536x1024" })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).size).toBe("1536x1024")
    await generateImageWithCache({ apiKey: "fake", modelId: "openai:gpt-image-2", prompt: "edit", referenceImages: [{ data: Buffer.from(jpg, "base64") }] })
    const body = fetchMock.mock.calls[1][1].body as FormData
    expect(body.has("size")).toBe(false)
    expect((body.get("image") as Blob).type).toBe("image/jpeg")
  })

  it.each([0, -1, Infinity, NaN])("rejects invalid aspect ratio %s before making a request", async (aspectRatio) => {
    await expect(generateImageWithCache({ apiKey: "fake", modelId: "openai:gpt-image-2", prompt: "test", aspectRatio, cacheDir })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fs.readdirSync(cacheDir)).toEqual([])
  })
})
