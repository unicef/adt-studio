import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createPresetRoutes } from "./presets.js"
import { createProviderRoutes } from "./providers.js"
import { createPromptRoutes } from "./prompts.js"

describe("persisted global Sectioning compatibility", () => {
  let dir: string
  let configPath: string
  let original: string
  let app: Hono

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-global-compatibility-"))
    configPath = path.join(dir, "config.yaml")
    original = "# preserved formatting\nstructure_types: {}\nrole_types: {}\n" +
      "page_sectioning:\n  mode: section # legacy alias\n" +
      "default_model: anthropic:claude-opus-4-6\n" +
      "base_prompt_model: anthropic:claude-opus-4-6\n" +
      "default_image_generation_model: google:gemini-3.1-flash-image\n" +
      "default_speech_generation_model: tts-1-hd\n"
    fs.writeFileSync(configPath, original)
    const prompts = path.join(dir, "prompts")
    fs.mkdirSync(path.join(prompts, "anthropic_claude_opus_4_6"), { recursive: true })
    fs.writeFileSync(path.join(prompts, "example.liquid"), "configured base prompt")
    fs.writeFileSync(path.join(prompts, "anthropic_claude_opus_4_6", "example.liquid"), "variant prompt")
    app = new Hono()
      .route("/", createPresetRoutes(configPath, path.join(dir, "books")))
      .route("/", createProviderRoutes(configPath))
      .route("/", createPromptRoutes(prompts, path.join(dir, "books"), configPath))
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it("normalizes Settings responses in memory without changing YAML", async () => {
    const raw = await app.request("/config")
    expect((await raw.json()).config.page_sectioning.mode).toBe("dynamic")
    const model = await app.request("/config/default-model")
    expect(model.status).toBe(200)
    expect(await model.json()).toEqual({ model: "anthropic:claude-opus-4-6" })
    const defaults = await app.request("/config/specialized-model-defaults")
    expect(defaults.status).toBe(200)
    expect(await defaults.json()).toEqual({ imageGeneration: "google:gemini-3.1-flash-image", speechGeneration: "tts-1-hd" })
    expect(fs.readFileSync(configPath, "utf8")).toBe(original)
  })

  it("uses configured provider and prompt defaults despite the legacy alias", async () => {
    const providers = await app.request("/providers")
    expect((await providers.json()).defaults["structured-text"]).toBe("anthropic:claude-opus-4-6")
    const prompt = await app.request("/prompts/example?model=anthropic%3Aclaude-opus-4-6")
    expect(prompt.status).toBe(200)
    expect(await prompt.json()).toMatchObject({ content: "configured base prompt", modelId: null })
    expect(fs.readFileSync(configPath, "utf8")).toBe(original)
  })

  it.each([
    ["/config/default-model", { model: "openai:gpt-5.4" }],
    ["/config/specialized-model-defaults", { imageGeneration: "openai:gpt-image-2", speechGeneration: "gpt-4o-mini-tts" }],
  ] as const)("updates only the requested model fields at %s", async (url, body) => {
    const response = await app.request(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    expect(response.status).toBe(200)
    expect(await (await app.request(url)).json()).toEqual(body)
    const saved = fs.readFileSync(configPath, "utf8")
    const unrelated = (value: string) => value.split("\n").filter(line => !/^default_(model|image_generation_model|speech_generation_model):/.test(line)).join("\n")
    expect(unrelated(saved)).toBe(unrelated(original))
    expect(saved).toContain("mode: section # legacy alias")
  })

  it("does not normalize unknown persisted values or write through invalid config", async () => {
    const invalid = original.replace("mode: section", "mode: unsupported")
    fs.writeFileSync(configPath, invalid)
    expect((await app.request("/config/default-model")).status).toBe(500)
    expect((await app.request("/config/default-model", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai:gpt-5.4" }) })).status).toBe(500)
    expect(fs.readFileSync(configPath, "utf8")).toBe(invalid)
  })
})
