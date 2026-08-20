import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { strToU8, zipSync } from "fflate"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLocalSpeechRoutes } from "./local-speech.js"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe("local speech routes", () => {
  it("installs only the selected files from a verified MLX bundle", async () => {
    const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-local-speech-test-"))
    temporaryDirectories.push(modelsDir)
    const archive = zipSync({
      "config.json": strToU8("{}"),
      "conversion_manifest.json": strToU8("{}"),
      "kokoro-v1_0.safetensors": strToU8("model"),
      "mlx.metallib": strToU8("metal"),
      "voices/af_heart.safetensors": strToU8("voice"),
      "voices/af_bella.safetensors": strToU8("unused"),
    })
    const revision = "a".repeat(40)
    const sha256 = crypto.createHash("sha256").update(archive).digest("hex")
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/models/")) {
        return Response.json({
          id: "mweinbach/kokoro-runtime-swift",
          sha: revision,
          siblings: [{
            rfilename: "kokoro-mlx-bundle.zip",
            size: archive.byteLength,
            lfs: { size: archive.byteLength, sha256 },
          }],
        })
      }
      return new Response(archive, {
        headers: { "content-length": String(archive.byteLength) },
      })
    }) as typeof fetch
    const app = createLocalSpeechRoutes(modelsDir, { fetchImpl })

    const response = await app.request("/local-speech/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository: "mweinbach/kokoro-runtime-swift",
        runtime: "mlx",
        voices: ["af_heart"],
      }),
    })

    expect(response.status).toBe(201)
    const modelDir = path.join(modelsDir, "mweinbach--kokoro-runtime-swift")
    expect(JSON.parse(fs.readFileSync(path.join(modelDir, "manifest.json"), "utf8"))).toMatchObject({
      repository: "mweinbach/kokoro-runtime-swift",
      revision,
      runtime: "mlx",
      dtype: "fp16",
      voices: ["af_heart"],
    })
    expect(fs.existsSync(path.join(modelDir, "mlx", "kokoro-v1_0.safetensors"))).toBe(true)
    expect(fs.existsSync(path.join(modelDir, "mlx", "voices", "af_heart.safetensors"))).toBe(true)
    expect(fs.existsSync(path.join(modelDir, "mlx", "voices", "af_bella.safetensors"))).toBe(false)
    expect(fs.existsSync(path.join(modelDir, "kokoro-mlx-bundle.zip"))).toBe(false)
  })

  it("adds a verified voice to an installed ONNX model", async () => {
    const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-local-speech-test-"))
    temporaryDirectories.push(modelsDir)
    const repository = "onnx-community/Kokoro-82M-v1.0-ONNX"
    const modelDir = path.join(modelsDir, "onnx-community--Kokoro-82M-v1.0-ONNX")
    fs.mkdirSync(path.join(modelDir, "voices"), { recursive: true })
    const revision = "b".repeat(40)
    fs.writeFileSync(path.join(modelDir, "manifest.json"), JSON.stringify({
      adapter: "kokoro",
      repository,
      revision,
      dtype: "q8",
      runtime: "onnx",
      modelFile: "onnx/model_quantized.onnx",
      voices: ["af_heart"],
      installedAt: new Date().toISOString(),
    }))
    const voice = strToU8("bella voice")
    const sha256 = crypto.createHash("sha256").update(voice).digest("hex")
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/api/models/")) {
        return Response.json({
          id: repository,
          sha: revision,
          siblings: [{
            rfilename: "voices/af_bella.bin",
            size: voice.byteLength,
            lfs: { size: voice.byteLength, sha256 },
          }],
        })
      }
      return new Response(voice, { headers: { "content-length": String(voice.byteLength) } })
    }) as typeof fetch
    const app = createLocalSpeechRoutes(modelsDir, { fetchImpl })

    const response = await app.request("/local-speech/models/onnx-community/Kokoro-82M-v1.0-ONNX/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: "af_bella" }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ voices: ["af_heart", "af_bella"] })
    expect(fs.readFileSync(path.join(modelDir, "voices", "af_bella.bin"))).toEqual(Buffer.from(voice))
  })
})
