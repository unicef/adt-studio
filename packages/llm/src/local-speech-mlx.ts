import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"

interface RuntimeResponse {
  id?: string
  status?: string
  samples?: number
  elapsed_ms?: number
  error?: string
}

interface PendingRequest {
  resolve: (audio: Uint8Array) => void
  reject: (error: Error) => void
  outputPath: string
  timer: NodeJS.Timeout
}

const RUNTIME_VERSION = "1"
const processPromises = new Map<string, Promise<MlxKokoroProcess>>()

function runtimeSourceDirectory(explicit?: string): string {
  if (explicit) return path.resolve(explicit)
  if (process.env.LOCAL_TTS_RUNTIME_DIR) return path.resolve(process.env.LOCAL_TTS_RUNTIME_DIR)
  const projectRoot = process.env.PROJECT_ROOT ?? process.cwd()
  return path.resolve(projectRoot, "apps", "desktop", ".runtime", "kokoro")
}

export function isMlxKokoroAvailable(runtimeDir?: string): boolean {
  return process.platform === "darwin"
    && process.arch === "arm64"
    && Number.parseInt(os.release().split(".")[0] ?? "0", 10) >= 24
    && fs.existsSync(path.join(runtimeSourceDirectory(runtimeDir), "adt-kokoro-runtime"))
}

function stageRuntime(args: { runtimeDir?: string; modelsDir: string; modelDir: string }): string {
  const source = path.join(runtimeSourceDirectory(args.runtimeDir), "adt-kokoro-runtime")
  if (!fs.existsSync(source)) throw new Error("Apple MLX speech runtime is not included in this app build")
  const destinationDir = path.join(path.resolve(args.modelsDir), ".runtime", `kokoro-${RUNTIME_VERSION}`)
  fs.mkdirSync(destinationDir, { recursive: true })
  const executable = path.join(destinationDir, "adt-kokoro-runtime")
  fs.copyFileSync(source, executable)
  fs.chmodSync(executable, 0o755)
  const metallib = path.join(args.modelDir, "mlx", "mlx.metallib")
  if (!fs.existsSync(metallib)) throw new Error("Downloaded Kokoro MLX model is missing mlx.metallib")
  fs.copyFileSync(metallib, path.join(destinationDir, "mlx.metallib"))
  return executable
}

class MlxKokoroProcess {
  readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, PendingRequest>()
  private readonly abandonedOutputs = new Map<string, string>()
  private stderrTail = ""
  private stopped = false

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-8_000)
    })
    child.once("exit", (code, signal) => {
      this.stopped = true
      const detail = this.stderrTail.trim()
      const error = new Error(`Kokoro MLX runtime exited (${signal ?? code ?? "unknown"})${detail ? `: ${detail}` : ""}`)
      for (const request of this.pending.values()) {
        clearTimeout(request.timer)
        fs.rmSync(request.outputPath, { force: true })
        request.reject(error)
      }
      this.pending.clear()
      for (const outputPath of this.abandonedOutputs.values()) fs.rmSync(outputPath, { force: true })
      this.abandonedOutputs.clear()
    })
  }

  static async start(args: { executable: string; modelDir: string }): Promise<MlxKokoroProcess> {
    const child = spawn(args.executable, ["--model-dir", args.modelDir], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })
    const runtime = new MlxKokoroProcess(child)
    const lines = createInterface({ input: child.stdout })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Kokoro MLX runtime startup timed out")), 30_000)
        const onExit = (code: number | null) => {
          clearTimeout(timer)
          const detail = runtime.stderrTail.trim()
          reject(new Error(`Kokoro MLX runtime failed to start (${code ?? "unknown"})${detail ? `: ${detail}` : ""}`))
        }
        const onError = (error: Error) => {
          clearTimeout(timer)
          reject(new Error(`Kokoro MLX runtime could not be started: ${error.message}`))
        }
        child.once("exit", onExit)
        child.once("error", onError)
        lines.once("line", (line) => {
          clearTimeout(timer)
          child.off("exit", onExit)
          child.off("error", onError)
          try {
            const response = JSON.parse(line) as RuntimeResponse
            if (response.status !== "ready") throw new Error(response.error ?? "Unexpected runtime response")
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
    } catch (error) {
      lines.close()
      child.kill("SIGTERM")
      throw error
    }
    lines.removeAllListeners("line")
    lines.on("line", (line) => runtime.handleLine(line))
    return runtime
  }

  private handleLine(line: string): void {
    let response: RuntimeResponse
    try { response = JSON.parse(line) as RuntimeResponse } catch { return }
    if (!response.id) return
    const request = this.pending.get(response.id)
    if (!request) {
      const abandonedOutput = this.abandonedOutputs.get(response.id)
      if (abandonedOutput) {
        this.abandonedOutputs.delete(response.id)
        fs.rmSync(abandonedOutput, { force: true })
      }
      return
    }
    this.pending.delete(response.id)
    clearTimeout(request.timer)
    if (response.error) {
      fs.rmSync(request.outputPath, { force: true })
      request.reject(new Error(response.error))
      return
    }
    try {
      const audio = fs.readFileSync(request.outputPath)
      fs.rmSync(request.outputPath, { force: true })
      request.resolve(new Uint8Array(audio))
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async synthesize(args: { phonemes: string; voice: string; speed: number; signal?: AbortSignal }): Promise<Uint8Array> {
    if (this.stopped) throw new Error("Kokoro MLX runtime is not running")
    args.signal?.throwIfAborted()
    const id = crypto.randomUUID()
    const outputPath = path.join(os.tmpdir(), `adt-kokoro-${id}.wav`)
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.abandonedOutputs.set(id, outputPath)
        fs.rmSync(outputPath, { force: true })
        reject(new Error("Kokoro MLX synthesis timed out"))
      }, 120_000)
      const onAbort = () => {
        this.pending.delete(id)
        this.abandonedOutputs.set(id, outputPath)
        clearTimeout(timer)
        fs.rmSync(outputPath, { force: true })
        reject(new DOMException("The operation was aborted", "AbortError"))
      }
      args.signal?.addEventListener("abort", onAbort, { once: true })
      this.pending.set(id, {
        outputPath,
        timer,
        resolve: (audio) => { args.signal?.removeEventListener("abort", onAbort); resolve(audio) },
        reject: (error) => { args.signal?.removeEventListener("abort", onAbort); reject(error) },
      })
      this.child.stdin.write(`${JSON.stringify({
        id,
        phonemes: args.phonemes,
        voice: args.voice,
        speed: args.speed,
        output_wav: outputPath,
      })}\n`)
    })
  }

  stop(): void {
    if (!this.stopped) this.child.kill("SIGTERM")
  }
}

export async function getMlxKokoroProcess(args: {
  runtimeDir?: string
  modelsDir: string
  modelDir: string
}): Promise<MlxKokoroProcess> {
  const modelDir = path.resolve(args.modelDir)
  const key = modelDir
  let promise = processPromises.get(key)
  if (!promise) {
    promise = (async () => {
      const executable = stageRuntime(args)
      return MlxKokoroProcess.start({ executable, modelDir })
    })().catch((error) => { processPromises.delete(key); throw error })
    processPromises.set(key, promise)
  }
  return promise
}

export function clearMlxKokoroProcesses(): void {
  for (const processPromise of processPromises.values()) {
    void processPromise.then((runtime) => runtime.stop()).catch(() => {})
  }
  processPromises.clear()
}
