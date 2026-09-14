import { spawn } from "node:child_process"
import type { CliLoginPort, CliLoginSession } from "../../ports/index.js"
import { describeSpawnFailure, locateCodexExecutable, spawnCodexCommand } from "./cli.js"
import { buildCodexEnv } from "./env.js"
import type { CodexCredentials } from "./structured-text.js"

const LOGIN_TIMEOUT_MS = 10 * 60_000
const LOGOUT_TIMEOUT_MS = 15_000
// eslint-disable-next-line no-control-regex -- the CLI colours its output
const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g
/** The URL must be followed by whitespace: a chunk boundary inside it must not freeze a truncated match. */
const AUTH_URL_PATTERN = /https:\/\/auth\.openai\.com\/\S+(?=\s)/

/**
 * `codex login` opens the ChatGPT sign-in in the machine's browser, serves the
 * OAuth callback on localhost itself and prints the authorize URL as a fallback
 * ("If your browser did not open, navigate to this URL"). That URL is the only
 * thing this module surfaces; the tokens the CLI receives stay in its files.
 */
export function parseLoginUrl(output: string): string | undefined {
  return AUTH_URL_PATTERN.exec(output.replace(ANSI_PATTERN, ""))?.[0]
}

export interface CodexLoginOptions {
  executable?: string
  env?: Record<string, string>
  signal?: AbortSignal
  /** Injected by tests; production spawns the real CLI. */
  spawnProcess?: typeof spawn
}

/**
 * Starts the CLI's browser login and resolves as soon as the sign-in URL has
 * been printed, leaving the process waiting for the callback. `completion`
 * settles when the CLI exits. Ambient API keys are dropped so the CLI signs
 * into a ChatGPT account, which is the only thing this flow is for.
 */
export function startCodexLogin(options: CodexLoginOptions = {}): Promise<CliLoginSession> {
  const executable = options.executable ?? locateCodexExecutable()
  const env = options.env ?? buildCodexEnv(undefined)
  const spawnProcess = options.spawnProcess ?? spawn

  return new Promise<CliLoginSession>((resolvePrompt, rejectPrompt) => {
    const child = spawnProcess(executable, ["login"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let output = ""
    let prompted = false
    let settled = false
    let resolveCompletion!: () => void
    let rejectCompletion!: (error: Error) => void
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })
    // A cancelled UI may never await completion; that must not become an
    // unhandled rejection.
    completion.catch(() => {})

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", onAbort)
      if (error) {
        if (!prompted) rejectPrompt(error)
        rejectCompletion(error)
      } else {
        if (!prompted) resolvePrompt({ completion, cancel: () => {} })
        resolveCompletion()
      }
    }
    const cancel = (): void => {
      finish(new Error("Codex sign-in was cancelled"))
      child.kill()
    }
    const onAbort = (): void => cancel()
    const timer = setTimeout(() => {
      finish(new Error("Codex sign-in timed out waiting for the browser"))
      child.kill()
    }, LOGIN_TIMEOUT_MS)
    options.signal?.addEventListener("abort", onAbort, { once: true })

    const onOutput = (chunk: string): void => {
      output += chunk
      if (prompted || settled) return
      const url = parseLoginUrl(output)
      if (!url) return
      prompted = true
      resolvePrompt({ url, completion, cancel })
    }

    child.stdout?.setEncoding("utf-8")
    child.stderr?.setEncoding("utf-8")
    child.stdout?.on("data", onOutput)
    child.stderr?.on("data", onOutput)
    child.on("error", (cause) => finish(describeSpawnFailure(executable, cause)))
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        finish()
        return
      }
      const detail = output.replace(ANSI_PATTERN, "").trim().slice(-400)
      finish(new Error(`Codex CLI login exited with code ${exitCode ?? "unknown"}${detail ? `: ${detail}` : ""}`))
    })
  })
}

export async function runCodexLogout(options: CodexLoginOptions = {}): Promise<void> {
  const executable = options.executable ?? locateCodexExecutable()
  const env = options.env ?? buildCodexEnv(undefined)
  const result = await spawnCodexCommand(
    executable,
    ["logout"],
    env,
    options.signal ?? AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
  )
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim().slice(-300)
    throw new Error(`Codex CLI logout exited with code ${result.exitCode}${detail ? `: ${detail}` : ""}`)
  }
}

export const codexCliLogin: CliLoginPort<CodexCredentials> = {
  start: (context) => startCodexLogin({ signal: context.signal }),
  logout: (context) => runCodexLogout({ signal: context.signal }),
}
