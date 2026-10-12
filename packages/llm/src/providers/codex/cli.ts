import { createCliRequestBudget } from "../shared/cli-request-budget.js"
import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { imageFileExtension } from "@adt/types"
import { CODEX_CLI_INSTALL_HINT, resolveCodexExecutable } from "./executable.js"

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

/** A base64 image the runner writes to the scratch directory and attaches with `--image`. */
export interface CodexCliImage {
  /** Raw base64 payload, data-URL prefix removed. */
  data: string
  mediaType: string
}

export interface CodexCliRequest {
  onProviderRequest?: () => void
  model: string
  prompt: string
  schema?: Record<string, unknown>
  images?: readonly CodexCliImage[]
  env: Record<string, string>
  signal: AbortSignal
  executable?: string
  scratchDir?: string
  /** Explicit transport fixture override; production leaves endpoint selection to the CLI. */
  apiBaseUrl?: string
}

export type CodexCliRunner = (request: CodexCliRequest) => Promise<CodexCliTurn>

const DEFAULT_EXECUTABLE = "codex"

/**
 * Discovery first (override, PATH, common install dirs, the ChatGPT desktop app),
 * then the bare name so a missing CLI still surfaces as the actionable ENOENT message.
 */
export function locateCodexExecutable(env: NodeJS.ProcessEnv = process.env): string {
  return resolveCodexExecutable({ env }) ?? DEFAULT_EXECUTABLE
}

export interface CodexArgsOptions {
  model: string
  workDir: string
  schemaPath?: string
  apiBaseUrl?: string
  imagePaths?: readonly string[]
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
  ]

  // `--image` is variadic in the CLI, so each file gets its own flag and
  // `--model` follows immediately: the trailing `-` positional must never be
  // read as one more image path.
  for (const imagePath of options.imagePaths ?? []) args.push("--image", imagePath)

  args.push(
    "--model",
    options.model,
    "-c",
    'approval_policy="never"',
    "-c",
    "tools.web_search=false",
    "-c",
    'model_provider="adt_bounded_openai"',
    "-c",
    'model_providers.adt_bounded_openai.name="OpenAI"',
    "-c",
    "model_providers.adt_bounded_openai.requires_openai_auth=true",
    "-c",
    "model_providers.adt_bounded_openai.request_max_retries=0",
    "-c",
    "model_providers.adt_bounded_openai.stream_max_retries=0",
    "-c",
    "model_providers.adt_bounded_openai.supports_websockets=false",
    "-c",
    'model_providers.adt_bounded_openai.env_http_headers={OpenAI-Organization="OPENAI_ORGANIZATION",OpenAI-Project="OPENAI_PROJECT"}',
    "-c",
    "features.unbounded_connection_retries=false",
  )

  // Built-in provider IDs cannot be overridden in current CLIs. The custom
  // definition retains OpenAI auth (resolved CODEX_API_KEY or the CLI login),
  // auth-dependent default endpoint and organization/project headers. Use SSE
  // so WebSocket fallback cannot add an extra request outside the facade.
  // The per-turn forwarding gate also caps agent/tool continuations.
  // Only an explicit runner override changes that endpoint. Do not adopt an
  // ambient OPENAI_BASE_URL belonging to a different provider.
  if (options.apiBaseUrl?.trim()) {
    args.push(
      "-c",
      `model_providers.adt_bounded_openai.base_url=${JSON.stringify(options.apiBaseUrl.trim())}`,
    )
  }

  if (options.schemaPath) args.push("--output-schema", options.schemaPath)
  args.push("-")
  return args
}

export const runCodexCli: CodexCliRunner = async (request) => {
  const executable = request.executable ?? locateCodexExecutable(request.env)
  const workDir = await mkdtemp(join(request.scratchDir ?? tmpdir(), "adt-codex-"))

  let budget: Awaited<ReturnType<typeof createCliRequestBudget>> | undefined
  try {
    budget = await createCliRequestBudget({
      signal: request.signal,
      env: request.env,
      onProviderRequest: request.onProviderRequest,
      upstream: (headers) =>
        request.apiBaseUrl ??
        (headers["chatgpt-account-id"]
          ? "https://chatgpt.com/backend-api/codex"
          : "https://api.openai.com/v1"),
    })
    let schemaPath: string | undefined
    if (request.schema) {
      schemaPath = join(workDir, "output-schema.json")
      await writeFile(schemaPath, JSON.stringify(request.schema), "utf-8")
    }

    const imagePaths = request.images?.length ? await writeCodexImages(workDir, request.images) : []

    const args = buildCodexArgs({
      model: request.model,
      workDir,
      apiBaseUrl: budget.url,
      ...(schemaPath ? { schemaPath } : {}),
      ...(imagePaths.length ? { imagePaths } : {}),
    })

    const outcome = await spawnCodexCommand(
      executable,
      args,
      budget.env as Record<string, string>,
      budget.signal,
      request.prompt,
    )
    budget.check()
    return readCodexTurn(outcome)
  } catch (error) {
    budget?.check()
    throw error
  } finally {
    await budget?.close()
    await rm(workDir, { recursive: true, force: true })
  }
}

/**
 * Images live in the per-turn scratch directory, which `runCodexCli` removes
 * once the turn ends, and are named by media type so the CLI recognises them.
 */
export async function writeCodexImages(
  workDir: string,
  images: readonly CodexCliImage[],
): Promise<string[]> {
  const paths: string[] = []
  for (const [index, image] of images.entries()) {
    const imagePath = join(workDir, `image-${index + 1}.${imageFileExtension(image.mediaType)}`)
    await writeFile(imagePath, Buffer.from(image.data, "base64"))
    paths.push(imagePath)
  }
  return paths
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
  stdinData?: string,
): Promise<CodexProcessResult> {
  return new Promise((resolve, reject) => {
    /** The prompt travels via stdin (`-` positional) to dodge the Windows 32k argv cap. */
    const child = spawn(executable, args, {
      env,
      signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })

    child.stdin.on("error", () => {})
    if (stdinData !== undefined) child.stdin.write(stdinData)
    child.stdin.end()

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

export function describeSpawnFailure(executable: string, cause: unknown): Error {
  const code = (cause as { code?: string }).code
  if (code === "ENOENT") {
    return new Error(`Codex CLI not found (tried "${executable}"). ${CODEX_CLI_INSTALL_HINT}`, {
      cause,
    })
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
    throw new Error(`Codex CLI exited with code ${result.exitCode}${detail ? `: ${detail}` : ""}`)
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
