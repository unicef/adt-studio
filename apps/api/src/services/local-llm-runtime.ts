import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { findLocalLlmModel } from "./local-llm-catalog.js"
import {
  isLocalLlmModelInstalled,
  localLlmModelDirectory,
  readLocalLlmManifest,
} from "./local-llm-model-store.js"

export interface LocalLlmRuntimeStatus {
  runtime: "embedded-llama.cpp"
  runtimeAvailable: boolean
  runtimeVersion: string | null
  state: "stopped" | "starting" | "ready" | "error"
  backend: "Metal" | "CUDA" | "Vulkan" | "CPU" | "detecting"
  device: string | null
  deviceMemoryBytes: number | null
  modelGpuMemoryBytes: number | null
  loadedModelId: string | null
  endpoint: string | null
  contextSize: number
  /** Number of independent llama.cpp request slots. */
  parallelSlots: number
  /** Total KV context shared by all request slots. */
  totalContextSize: number
  gpuLayersRequested: number
  gpuLayersLoaded: number | null
  processId: number | null
  requests: number
  lastRequestMs: number | null
  promptTokensPerSecond: number | null
  generatedTokensPerSecond: number | null
  error: string | null
}

export interface LocalLlmRuntime {
  status(): LocalLlmRuntimeStatus
  ensureRunning(idOrAlias: string): Promise<{ baseUrl: string; apiKey: string }>
  stop(): Promise<void>
  recordResponse(durationMs: number, body: unknown): void
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function readRuntimeVersion(runtimeDir: string): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(runtimeDir, "runtime-manifest.json"), "utf8")) as { version?: string }
    return manifest.version ?? null
  } catch {
    return null
  }
}

function executablePath(runtimeDir: string): string {
  return process.env.LOCAL_LLM_SERVER_PATH
    || path.join(runtimeDir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
}

function inferBackend(line: string): LocalLlmRuntimeStatus["backend"] | null {
  if (/metal/i.test(line)) return "Metal"
  if (/cuda/i.test(line)) return "CUDA"
  if (/vulkan/i.test(line)) return "Vulkan"
  if (/cpu buffer|cpu backend|using cpu/i.test(line)) return "CPU"
  return null
}

function timingNumber(body: unknown, keys: string[]): number | null {
  if (!body || typeof body !== "object") return null
  const timings = (body as { timings?: Record<string, unknown> }).timings
  if (!timings) return null
  for (const key of keys) {
    const value = timings[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

export function createLocalLlmRuntime(options: {
  runtimeDir: string
  modelsDir: string
  fetchImpl?: typeof fetch
  startupTimeoutMs?: number
}): LocalLlmRuntime {
  const fetchImpl = options.fetchImpl ?? fetch
  // Sectioning requests include the page image, crop images, schema, and
  // validation feedback; real classroom PDFs regularly exceed an 8K context.
  const contextSize = Number(process.env.LOCAL_LLM_CONTEXT_SIZE || 16_384)
  const configuredParallelSlots = Number.parseInt(process.env.LOCAL_LLM_PARALLEL ?? "", 10)
  const adaptiveParallelSlots = os.availableParallelism() >= 10 && os.totalmem() >= 24 * 1024 ** 3 ? 2 : 1
  const parallelSlots = Number.isInteger(configuredParallelSlots) && configuredParallelSlots > 0
    ? Math.min(configuredParallelSlots, 8)
    : adaptiveParallelSlots
  // llama.cpp divides --ctx-size across slots. Preserve the documented
  // per-request context instead of accidentally shrinking it as slots grow.
  const totalContextSize = contextSize * parallelSlots
  const gpuLayersRequested = Number(process.env.LOCAL_LLM_GPU_LAYERS || 99)
  let child: ChildProcessWithoutNullStreams | null = null
  let port: number | null = null
  let loadedModelId: string | null = null
  let state: LocalLlmRuntimeStatus["state"] = "stopped"
  let backend: LocalLlmRuntimeStatus["backend"] = "detecting"
  let device: string | null = null
  let error: string | null = null
  let requests = 0
  let lastRequestMs: number | null = null
  let promptTokensPerSecond: number | null = null
  let generatedTokensPerSecond: number | null = null
  let gpuLayersLoaded: number | null = null
  let deviceMemoryBytes: number | null = null
  let modelGpuMemoryBytes: number | null = null
  let transition: Promise<unknown> = Promise.resolve()
  const apiKey = crypto.randomBytes(32).toString("base64url")

  async function stopNow(): Promise<void> {
    const running = child
    child = null
    port = null
    loadedModelId = null
    if (!running || running.exitCode != null) {
      state = "stopped"
      return
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        running.kill("SIGKILL")
        resolve()
      }, 5_000)
      running.once("exit", () => {
        clearTimeout(timer)
        resolve()
      })
      running.kill("SIGTERM")
    })
    state = "stopped"
  }

  async function startNow(idOrAlias: string): Promise<{ baseUrl: string; apiKey: string }> {
    const model = findLocalLlmModel(idOrAlias)
    if (!model) throw new Error(`Unsupported local model: ${idOrAlias}`)
    if (state === "ready" && child?.exitCode == null && loadedModelId === model.id && port) {
      return { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey }
    }
    if (!isLocalLlmModelInstalled(options.modelsDir, model)) {
      throw new Error(`${model.label} is not installed. Download it in Local AI settings.`)
    }
    const executable = executablePath(options.runtimeDir)
    if (!fs.existsSync(executable)) {
      throw new Error("Embedded llama.cpp runtime is missing from this app build")
    }

    await stopNow()
    state = "starting"
    backend = "detecting"
    device = null
    deviceMemoryBytes = null
    modelGpuMemoryBytes = null
    gpuLayersLoaded = null
    error = null
    port = await freePort()
    const manifest = readLocalLlmManifest(options.modelsDir, model.id)
    const modelDir = localLlmModelDirectory(options.modelsDir, model)
    const args = [
      "--model", path.join(modelDir, manifest.modelFile),
      "--mmproj", path.join(modelDir, manifest.mmprojFile),
      "--host", "127.0.0.1",
      "--port", String(port),
      "--ctx-size", String(totalContextSize),
      "--parallel", String(parallelSlots),
      "--gpu-layers", String(gpuLayersRequested),
      "--jinja",
      "--no-webui",
      "--metrics",
      "--api-key", apiKey,
      "--reasoning", "off",
      // Trace output contains backend/device/offload details used by the debug
      // panel. It is parsed but only forwarded when explicitly requested.
      "--verbosity", "4",
    ]
    child = spawn(executable, args, {
      cwd: options.runtimeDir,
      stdio: "pipe",
      windowsHide: true,
      env: { ...process.env, LLAMA_CACHE: path.join(options.modelsDir, ".cache") },
    })
    loadedModelId = model.id

    const inspectLog = (data: Buffer) => {
      const line = data.toString()
      const detected = inferBackend(line)
      if (detected && (detected !== "CPU" || backend === "detecting")) backend = detected
      const deviceMatch = line.match(/(?:gpu name|device|using)\s*[:=]\s*([^\n]{3,100})/i)
      if (deviceMatch && /(metal|cuda|vulkan|gpu)/i.test(line)) device = deviceMatch[1].trim()
      const layersMatch = line.match(/offloaded\s+(\d+)\s*\/\s*\d+\s+layers/i)
      if (layersMatch) gpuLayersLoaded = Number(layersMatch[1])
      const deviceMemoryMatch = line.match(/(?:MTL\d+|CUDA\d+|Vulkan\d+).*?\((\d+)\s+MiB(?:,|\))/i)
      if (deviceMemoryMatch) deviceMemoryBytes = Number(deviceMemoryMatch[1]) * 1024 ** 2
      const modelMemoryMatch = line.match(/(?:MTL\d+|CUDA\d+|Vulkan\d+).*?model buffer size\s*=\s*([\d.]+)\s+MiB/i)
      if (modelMemoryMatch) modelGpuMemoryBytes = Number(modelMemoryMatch[1]) * 1024 ** 2
      if (process.env.LOCAL_LLM_VERBOSE_LOGS === "1") {
        process.stderr.write(`[local-llm] ${line}`)
      }
    }
    child.stdout.on("data", inspectLog)
    child.stderr.on("data", inspectLog)
    child.once("exit", (code) => {
      if (child?.exitCode === code) {
        child = null
        port = null
        state = code === 0 ? "stopped" : "error"
        if (code !== 0) error = `llama.cpp exited with code ${code}`
      }
    })

    const deadline = Date.now() + (options.startupTimeoutMs ?? 180_000)
    while (Date.now() < deadline) {
      if (!child || child.exitCode != null) throw new Error(error || "llama.cpp exited while loading the model")
      try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(1_000),
        })
        if (response.ok) {
          state = "ready"
          if (backend === "detecting") backend = "CPU"
          return { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey }
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    await stopNow()
    throw new Error("Timed out while loading the local model")
  }

  const runtime: LocalLlmRuntime = {
    status: () => ({
      runtime: "embedded-llama.cpp",
      runtimeAvailable: fs.existsSync(executablePath(options.runtimeDir)),
      runtimeVersion: readRuntimeVersion(options.runtimeDir),
      state,
      backend,
      device,
      deviceMemoryBytes,
      modelGpuMemoryBytes,
      loadedModelId,
      endpoint: port ? `http://127.0.0.1:${port}` : null,
      contextSize,
      parallelSlots,
      totalContextSize,
      gpuLayersRequested,
      gpuLayersLoaded,
      processId: child?.pid ?? null,
      requests,
      lastRequestMs,
      promptTokensPerSecond,
      generatedTokensPerSecond,
      error,
    }),
    ensureRunning: async (idOrAlias) => {
      const next = transition.then(() => startNow(idOrAlias))
      transition = next.catch((cause) => {
        state = "error"
        error = cause instanceof Error ? cause.message : String(cause)
      })
      return next
    },
    stop: async () => {
      const next = transition.then(stopNow)
      transition = next.catch(() => undefined)
      await next
    },
    recordResponse: (durationMs, body) => {
      requests += 1
      lastRequestMs = durationMs
      promptTokensPerSecond = timingNumber(body, ["prompt_per_second", "prompt_tokens_per_second"])
      generatedTokensPerSecond = timingNumber(body, ["predicted_per_second", "tokens_per_second"])
    },
  }

  const killChild = () => { child?.kill("SIGTERM") }
  process.once("exit", killChild)
  return runtime
}
