import { afterEach, describe, expect, it, vi } from "vitest"
import jpeg from "jpeg-js"
import type { AppConfig } from "@adt/types"
import { buildImageTranslationConfig, translateImage } from "../image-translation.js"

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    structure_types: {},
    role_types: {},
    ...overrides,
  }
}

describe("buildImageTranslationConfig", () => {
  it.each(["openai:dall-e-3", "google:gemini-3.1-flash-image"])("inherits the image-generation default %s", (model) => {
    expect(
      buildImageTranslationConfig(
        makeConfig({ default_image_generation_model: model }),
      ).modelId,
    ).toBe(model)
  })

  it.each(["openai:gpt-image-2", "google:gemini-3.1-flash-image"])("prioritizes the translation override %s", (model) => {
    expect(
      buildImageTranslationConfig(
        makeConfig({
          default_image_generation_model: "openai:dall-e-3",
          image_translation: { image_model: model },
        }),
      ).modelId,
    ).toBe(model)
  })
})

describe("translateImage output validation", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAAH0lEQVR4AV3BwREAMAiAMMr+O1ufHsmbxSEhISEh8QGPSwQIxMxWxQAAAABJRU5ErkJggg==", "base64")
  const jpg = jpeg.encode({ width: 4, height: 6, data: Buffer.alloc(4 * 6 * 4, 255) }).data
  const options = { apiKey: "fake-google-key", modelId: "google:gemini-3.1-flash-image",
    prompt: "Translate labels", sourceLanguage: "en", targetLanguage: "es", imageBuffer: png, imageName: "diagram.png" }
  afterEach(() => vi.unstubAllGlobals())

  it.each([[png, "image/png"], [jpg, "image/jpeg"]] as const)("propagates validated dimensions and MIME", async (buffer, mimeType) => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ status: "completed", steps: [
      { type: "model_output", content: [{ type: "image", mime_type: mimeType, data: buffer.toString("base64") }] },
    ] }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await translateImage(options)).toEqual({ buffer, mimeType, width: 4, height: 6, cached: false })
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty("response_format")
  })

  it("rejects a dimensionless JPEG before returning translated content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "completed", steps: [
      { type: "model_output", content: [{ type: "image", mime_type: "image/jpeg", data: "/9j/2Q==" }] },
    ] })))
    await expect(translateImage(options)).rejects.toThrow("could not be decoded")
  })
})
