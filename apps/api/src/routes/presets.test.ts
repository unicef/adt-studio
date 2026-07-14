import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createPresetRoutes } from "./presets.js"

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-presets-route-"))
  configPath = path.join(tmpDir, "config.yaml")
  fs.writeFileSync(
    configPath,
    "# keep this comment\nstructure_types: {}\nrole_types: {}\n",
    "utf-8",
  )
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("global default model", () => {
  it("returns GPT-5.4 when no override is configured", async () => {
    const response = await createPresetRoutes(configPath).request(
      "/config/default-model",
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ model: "openai:gpt-5.4" })
  })

  it("updates the model without discarding the config formatting", async () => {
    const app = createPresetRoutes(configPath)
    const response = await app.request("/config/default-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: " Anthropic:Claude-Sonnet-4-6 " }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      model: "anthropic:claude-sonnet-4-6",
    })
    expect(fs.readFileSync(configPath, "utf-8")).toContain("# keep this comment")

    const readResponse = await app.request("/config/default-model")
    expect(await readResponse.json()).toEqual({
      model: "anthropic:claude-sonnet-4-6",
    })
  })

  it("rejects invalid model ids", async () => {
    const response = await createPresetRoutes(configPath).request(
      "/config/default-model",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "../invalid" }),
      },
    )

    expect(response.status).toBe(400)
  })
})
