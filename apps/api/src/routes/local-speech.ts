import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { unzipSync } from "fflate"
import {
  DEFAULT_KOKORO_MODEL,
  DEFAULT_KOKORO_VOICE,
  KOKORO_VOICES,
  createLocalHfTTSSynthesizer,
  clearLocalHfTTSRuntimeCache,
  localHfModelDirectory,
  normalizeHfModelSource,
  readLocalHfManifest,
  type LocalHfModelManifest,
  type LocalHfTTSDtype,
  isMlxKokoroAvailable,
} from "@adt/llm"

const InstallRequest = z.object({
  repository: z.string().min(3).max(200),
  runtime: z.enum(["onnx", "mlx"]).default("onnx"),
  dtype: z.enum(["q8", "q4", "fp32", "fp16", "q4f16"]).default("q8"),
  voices: z.array(z.enum(KOKORO_VOICES)).min(1).max(12).default([DEFAULT_KOKORO_VOICE]),
})
const SearchQuery = z.object({ q: z.string().max(100).default("kokoro") })
const TestRequest = z.object({
  repository: z.string(),
  voice: z.enum(KOKORO_VOICES).default(DEFAULT_KOKORO_VOICE),
  text: z.string().min(1).max(500).default("Local speech is ready."),
})

const MODEL_FILES: Record<LocalHfTTSDtype, string> = {
  q8: "onnx/model_quantized.onnx",
  q4: "onnx/model_q4.onnx",
  fp32: "onnx/model.onnx",
  fp16: "onnx/model_fp16.onnx",
  q4f16: "onnx/model_q4f16.onnx",
}
const MAX_DOWNLOAD_BYTES = 1_500_000_000
const KOKORO_MLX_REPOSITORY = "mweinbach/kokoro-runtime-swift"
const KOKORO_MLX_ARCHIVE = "kokoro-mlx-bundle.zip"

interface HfSibling { rfilename?: string; size?: number; lfs?: { sha256?: string; size?: number } }
interface HfModelInfo { id?: string; sha?: string; pipeline_tag?: string; siblings?: HfSibling[]; private?: boolean; gated?: boolean | string }

function listInstalled(modelsDir: string): LocalHfModelManifest[] {
  if (!fs.existsSync(modelsDir)) return []
  return fs.readdirSync(modelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .flatMap((entry) => {
      try { return [readLocalHfManifest(modelsDir, entry.name.replace("--", "/"))] }
      catch { return [] }
    })
}

async function fetchModelInfo(repository: string, fetchImpl: typeof fetch): Promise<HfModelInfo> {
  const response = await fetchImpl(`https://huggingface.co/api/models/${repository}/revision/main`, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new HTTPException(response.status === 404 ? 404 : 502, { message: `Hugging Face returned HTTP ${response.status}` })
  return response.json() as Promise<HfModelInfo>
}

function assertCompatible(info: HfModelInfo, requiredFiles: string[]): string {
  if (info.private || info.gated) throw new HTTPException(400, { message: "Private or gated models are not supported yet" })
  const revision = info.sha
  if (!revision || !/^[a-f0-9]{40}$/i.test(revision)) throw new HTTPException(502, { message: "Hugging Face did not return an immutable revision" })
  const files = new Set((info.siblings ?? []).map((item) => item.rfilename))
  const missing = requiredFiles.filter((file) => !files.has(file))
  if (missing.length) throw new HTTPException(400, { message: `Not a compatible Kokoro ONNX repository; missing ${missing.join(", ")}` })
  return revision
}

async function downloadFile(args: {
  repository: string; revision: string; file: string; destination: string; sibling?: HfSibling
  fetchImpl: typeof fetch; signal: AbortSignal
}): Promise<void> {
  const sourceUrl = `https://huggingface.co/${args.repository}/resolve/${args.revision}/${args.file}`
  let expectedSize = args.sibling?.lfs?.size ?? args.sibling?.size
  let expectedSha = args.sibling?.lfs?.sha256
  if (!expectedSize || !expectedSha) {
    const metadata = await args.fetchImpl(sourceUrl, { method: "HEAD", redirect: "manual", signal: args.signal })
    const linkedSize = Number(metadata.headers.get("x-linked-size"))
    const linkedEtag = metadata.headers.get("x-linked-etag")?.replaceAll('"', "")
    if (!expectedSize && Number.isSafeInteger(linkedSize)) expectedSize = linkedSize
    if (!expectedSha && linkedEtag && /^[a-f0-9]{64}$/i.test(linkedEtag)) expectedSha = linkedEtag
  }
  const response = await args.fetchImpl(sourceUrl, {
    redirect: "follow", signal: args.signal,
  })
  if (!response.ok || !response.body) throw new Error(`Download failed for ${args.file}: HTTP ${response.status}`)
  if (expectedSize && expectedSize > MAX_DOWNLOAD_BYTES) throw new Error(`${args.file} exceeds the download limit`)
  fs.mkdirSync(path.dirname(args.destination), { recursive: true })
  const output = fs.createWriteStream(`${args.destination}.part`, { flags: "wx" })
  const hash = crypto.createHash("sha256")
  let size = 0
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength
      if (size > MAX_DOWNLOAD_BYTES) throw new Error(`${args.file} exceeds the download limit`)
      hash.update(chunk); if (!output.write(chunk)) await new Promise<void>((resolve) => output.once("drain", resolve))
    }
    await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()))
    if (expectedSize && size !== expectedSize) throw new Error(`Size mismatch for ${args.file}`)
    if (expectedSha && hash.digest("hex") !== expectedSha) throw new Error(`Checksum mismatch for ${args.file}`)
    fs.renameSync(`${args.destination}.part`, args.destination)
  } catch (error) {
    output.destroy(); fs.rmSync(`${args.destination}.part`, { force: true }); throw error
  }
}

export function createLocalSpeechRoutes(modelsDir: string, options: { fetchImpl?: typeof fetch } = {}) {
  const app = new Hono()
  const fetchImpl = options.fetchImpl ?? fetch
  fs.mkdirSync(modelsDir, { recursive: true })

  app.get("/local-speech/status", (c) => c.json({
    provider: "local-hf", adapter: "kokoro",
    supportedLanguages: ["en", "en-US", "en-GB"], recommendedRepository: DEFAULT_KOKORO_MODEL,
    voices: KOKORO_VOICES, installed: listInstalled(modelsDir),
    acceleratedRepository: KOKORO_MLX_REPOSITORY,
    mlxRuntimeAvailable: isMlxKokoroAvailable(process.env.LOCAL_TTS_RUNTIME_DIR),
  }))

  app.get("/local-speech/search", async (c) => {
    const parsed = SearchQuery.safeParse(c.req.query())
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid search" })
    const url = new URL("https://huggingface.co/api/models")
    url.searchParams.set("search", parsed.data.q || "kokoro")
    url.searchParams.set("filter", "text-to-speech")
    url.searchParams.set("limit", "20")
    url.searchParams.set("full", "true")
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new HTTPException(502, { message: `Hugging Face returned HTTP ${response.status}` })
    const models = await response.json() as HfModelInfo[]
    return c.json(models.map((model) => {
      const files = new Set((model.siblings ?? []).map((item) => item.rfilename))
      return {
        id: model.id,
        compatible: files.has("tokenizer.json") && files.has("onnx/model_quantized.onnx") && files.has("voices/af_heart.bin"),
        mlxCompatible: files.has(KOKORO_MLX_ARCHIVE),
      }
    }).filter((model) => model.id))
  })

  app.post("/local-speech/install", async (c) => {
    const parsed = InstallRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid local speech model configuration" })
    let repository: string
    try { repository = normalizeHfModelSource(parsed.data.repository) }
    catch (error) { throw new HTTPException(400, { message: error instanceof Error ? error.message : String(error) }) }
    if (parsed.data.runtime === "mlx") {
      const info = await fetchModelInfo(repository, fetchImpl)
      const revision = assertCompatible(info, [KOKORO_MLX_ARCHIVE])
      const destination = localHfModelDirectory(modelsDir, repository)
      if (fs.existsSync(path.join(destination, "manifest.json"))) throw new HTTPException(409, { message: "Model is already installed; remove it before replacing" })
      const staging = path.join(modelsDir, ".staging", crypto.randomUUID())
      try {
        const archivePath = path.join(staging, KOKORO_MLX_ARCHIVE)
        await downloadFile({
          repository,
          revision,
          file: KOKORO_MLX_ARCHIVE,
          destination: archivePath,
          sibling: info.siblings?.find((item) => item.rfilename === KOKORO_MLX_ARCHIVE),
          fetchImpl,
          signal: c.req.raw.signal,
        })
        const archive = unzipSync(new Uint8Array(fs.readFileSync(archivePath)))
        const selectedFiles = [
          "config.json",
          "conversion_manifest.json",
          "kokoro-v1_0.safetensors",
          "mlx.metallib",
          ...parsed.data.voices.map((voice) => `voices/${voice}.safetensors`),
        ]
        for (const file of selectedFiles) {
          const data = archive[file]
          if (!data?.byteLength) throw new Error(`Kokoro MLX bundle is missing ${file}`)
          const output = path.join(staging, "mlx", file)
          fs.mkdirSync(path.dirname(output), { recursive: true })
          fs.writeFileSync(output, data, { flag: "wx" })
        }
        fs.rmSync(archivePath, { force: true })
        const manifest: LocalHfModelManifest = {
          adapter: "kokoro",
          repository,
          revision,
          dtype: "fp16",
          runtime: "mlx",
          modelFile: "mlx/kokoro-v1_0.safetensors",
          voices: parsed.data.voices,
          installedAt: new Date().toISOString(),
        }
        fs.writeFileSync(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" })
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.renameSync(staging, destination)
        clearLocalHfTTSRuntimeCache()
        return c.json(manifest, 201)
      } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true })
        throw new HTTPException(502, { message: error instanceof Error ? error.message : String(error) })
      }
    }
    const modelFile = MODEL_FILES[parsed.data.dtype]
    const requiredFiles = ["config.json", "tokenizer.json", modelFile, ...parsed.data.voices.map((voice) => `voices/${voice}.bin`)]
    const info = await fetchModelInfo(repository, fetchImpl)
    const revision = assertCompatible(info, requiredFiles)
    const destination = localHfModelDirectory(modelsDir, repository)
    if (fs.existsSync(path.join(destination, "manifest.json"))) throw new HTTPException(409, { message: "Model is already installed; remove it before replacing" })
    const staging = path.join(modelsDir, ".staging", crypto.randomUUID())
    try {
      for (const file of requiredFiles) {
        const sibling = info.siblings?.find((item) => item.rfilename === file)
        await downloadFile({ repository, revision, file, destination: path.join(staging, file), sibling, fetchImpl, signal: c.req.raw.signal })
      }
      const modelConfig = JSON.parse(fs.readFileSync(path.join(staging, "config.json"), "utf8")) as { model_type?: string }
      if (modelConfig.model_type !== "style_text_to_speech_2") {
        throw new Error("Repository is not a compatible StyleTTS2/Kokoro model")
      }
      const tokenizer = JSON.parse(fs.readFileSync(path.join(staging, "tokenizer.json"), "utf8")) as { model?: { vocab?: unknown } }
      if (!tokenizer.model?.vocab || typeof tokenizer.model.vocab !== "object") {
        throw new Error("Repository has an incompatible tokenizer")
      }
      const manifest: LocalHfModelManifest = {
        adapter: "kokoro", repository, revision, dtype: parsed.data.dtype,
        runtime: "onnx", modelFile, voices: parsed.data.voices, installedAt: new Date().toISOString(),
      }
      fs.writeFileSync(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" })
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.renameSync(staging, destination)
      clearLocalHfTTSRuntimeCache()
      return c.json(manifest, 201)
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true })
      if (error instanceof HTTPException) throw error
      throw new HTTPException(502, { message: error instanceof Error ? error.message : String(error) })
    }
  })

  app.delete("/local-speech/models/:owner/:model", (c) => {
    const repository = normalizeHfModelSource(`${c.req.param("owner")}/${c.req.param("model")}`)
    const destination = localHfModelDirectory(modelsDir, repository)
    if (!fs.existsSync(path.join(destination, "manifest.json"))) throw new HTTPException(404, { message: "Model is not installed" })
    fs.rmSync(destination, { recursive: true, force: true })
    clearLocalHfTTSRuntimeCache()
    return c.json({ removed: repository })
  })

  app.post("/local-speech/test", async (c) => {
    const parsed = TestRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid speech test" })
    const synth = createLocalHfTTSSynthesizer({ modelsDir, runtimeDir: process.env.LOCAL_TTS_RUNTIME_DIR })
    const audio = await synth.synthesize({ input: parsed.data.text, model: parsed.data.repository, voice: parsed.data.voice, responseFormat: "wav", language: "en", signal: c.req.raw.signal })
    return new Response(audio, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } })
  })

  return app
}
