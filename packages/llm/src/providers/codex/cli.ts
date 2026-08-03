import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface CodexCliUsage {
  input_tokens?: number
  output_tokens?: number
  cached_input_tokens?: number
  reasoning_output_tokens?: number
}

export interface CodexCliTurn {
  finalMessage: string
  usage?: CodexCliUsage
  /**
   * `error` items the CLI reports without failing the turn (unknown model
   * metadata, transport fallbacks). They only reach the caller's error when the
   * turn produced no usable output.
   */
  advisoryErrors: string[]
}

export interface CodexCliRequest {
  model: string
  prompt: string
  schema?: Record<string, unknown>
  env: Record<string, string>
  signal: AbortSignal
  executable?: string
  scratchDir?: string
}

export type CodexCliRunner = (request: CodexCliRequest) => Promise<CodexCliTurn>

const DEFAULT_EXECUTABLE = "codex"

export function codexExecutable(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_EXECUTABLE?.trim() || DEFAULT_EXECUTABLE
}

export interface CodexArgsOptions {
  model: string
  prompt: string
  workDir: string
  schemaPath?: string
}

export function buildCodexArgs(options: CodexArgsOptions): string[] {
  const args = [
    "exec",
    "--json",
    "--color",
    "never",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--cd",
    options.workDir,
    "--model",
    options.model,
    "-c",
    'approval_policy="never"',
    "-c",
    "tools.web_search=false",
  ]

  if (options.schemaPath) args.push("--output-schema", options.schemaPath)
  args.push(options.prompt)
  return args
}

export const runCodexCli: CodexCliRunner = async (request) => {
  const executable = request.executable ?? codexExecutable(request.env)
  const workDir = await mkdtemp(join(request.scratchDir ?? tmpdir(), "adt-codex-"))

  try {
    let schemaPath: string | undefined
    if (request.schema) {
      schemaPath = join(workDir, "output-schema.json")
      await writeFile(schemaPath, JSON.stringify(request.schema), "utf-8")
    }

    const args = buildCodexArgs({
      model: request.model,
      prompt: request.prompt,
      workDir,
      ...(schemaPath ? { schemaPath } : {}),
    })

    const outcome = await spawnCodexCommand(executable, args, request.env, request.signal)
    return readCodexTurn(outcome)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export interface CodexProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function spawnCodexCommand(
  executable: string,
  args: string[],
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<CodexProcessResult> {
  return new Promise((resolve, reject) => {
    /** `exec` reads the prompt from stdin when it stays open, so it is closed here. */
    const child = spawn(executable, args, {
      env,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf-8")
    child.stderr.setEncoding("utf-8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })

    child.on("error", (cause) => reject(describeSpawnFailure(executable, cause)))
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 0 }))
  })
}

function describeSpawnFailure(executable: string, cause: unknown): Error {
  const code = (cause as { code?: string }).code
  if (code === "ENOENT") {
    return new Error(
      `Codex CLI not found: "${executable}" is not on PATH. Install the Codex CLI and run \`codex login\`, or set CODEX_EXECUTABLE to its full path.`,
      { cause },
    )
  }
  return new Error(
    `Codex CLI could not be started: ${cause instanceof Error ? cause.message : String(cause)}`,
    { cause },
  )
}

export function isMissingCodexExecutable(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause
  return cause?.code === "ENOENT"
}

interface CodexCliEvent {
  type?: string
  message?: string
  item?: { type?: string; text?: string; message?: string }
  error?: { message?: string }
  usage?: CodexCliUsage
}

export function readCodexTurn(result: CodexProcessResult): CodexCliTurn {
  let finalMessage = ""
  let usage: CodexCliUsage | undefined
  let failure: string | undefined
  let lastTransportError: string | undefined
  const advisoryErrors: string[] = []

  for (const line of result.stdout.split("\n")) {
    const event = parseEvent(line)
    if (!event) continue

    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      if (typeof event.item.text === "string") finalMessage = event.item.text
    } else if (event.type === "item.completed" && event.item?.type === "error") {
      if (event.item.message) advisoryErrors.push(event.item.message)
    } else if (event.type === "error") {
      if (event.message) lastTransportError = event.message
    } else if (event.type === "turn.failed") {
      failure = event.error?.message
    } else if (event.type === "turn.completed") {
      usage = event.usage
    }
  }

  if (failure || result.exitCode !== 0) {
    const detail = failure ?? lastTransportError ?? result.stderr.trim().slice(-400)
    throw new Error(
      `Codex CLI exited with code ${result.exitCode}${detail ? `: ${detail}` : ""}`,
    )
  }

  return { finalMessage, ...(usage ? { usage } : {}), advisoryErrors }
}

function parseEvent(line: string): CodexCliEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{")) return null
  try {
    return JSON.parse(trimmed) as CodexCliEvent
  } catch {
    return null
  }
}
