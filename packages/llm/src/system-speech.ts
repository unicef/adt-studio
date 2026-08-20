import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import type { SynthesizeSpeechOptions, TTSSynthesizer } from "./speech.js"

export interface MacSystemTTSConfig {
  /** Multiplier around the accessible default of 180 words/minute. */
  speed?: number
  /** Override used by tests or non-standard macOS installations. */
  sayPath?: string
}

export function isMacSystemSpeechAvailable(sayPath = "/usr/bin/say"): boolean {
  return process.platform === "darwin" && fs.existsSync(sayPath)
}

/**
 * Export a macOS system voice to canonical mono PCM16 WAV. Voice assets are
 * managed by macOS and may be downloaded in System Settings; nothing is added
 * to the Electron bundle and no network service is called during synthesis.
 */
export function createMacSystemTTSSynthesizer(config: MacSystemTTSConfig = {}): TTSSynthesizer {
  const sayPath = config.sayPath ?? "/usr/bin/say"
  if (!isMacSystemSpeechAvailable(sayPath)) {
    throw new Error("macOS system speech is unavailable on this computer")
  }
  const speed = Math.max(0.5, Math.min(2, config.speed ?? 1))
  const wordsPerMinute = String(Math.round(180 * speed))

  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      if (options.responseFormat.toLowerCase() !== "wav") {
        throw new Error("macOS system speech outputs WAV audio only")
      }
      options.signal?.throwIfAborted()
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-system-speech-"))
      const outputPath = path.join(tempDir, "speech.wav")
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(sayPath, [
            "-v", options.voice || "Samantha",
            "-r", wordsPerMinute,
            "--file-format=WAVE",
            "--data-format=LEI16@24000",
            "-o", outputPath,
            options.input,
          ], { stdio: ["ignore", "ignore", "pipe"] })
          let stderr = ""
          child.stderr.on("data", (chunk: Buffer) => {
            if (stderr.length < 4_096) stderr += chunk.toString()
          })
          const onAbort = () => child.kill("SIGTERM")
          options.signal?.addEventListener("abort", onAbort, { once: true })
          child.once("error", reject)
          child.once("exit", (code, signal) => {
            options.signal?.removeEventListener("abort", onAbort)
            if (options.signal?.aborted) {
              reject(new DOMException("The operation was aborted", "AbortError"))
            } else if (code === 0) {
              resolve()
            } else {
              reject(new Error(`macOS speech failed (${signal ?? code}): ${stderr.trim() || "unknown error"}`))
            }
          })
        })
        const bytes = fs.readFileSync(outputPath)
        if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF") {
          throw new Error("macOS speech returned an invalid WAV file")
        }
        return bytes
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    },
  }
}
