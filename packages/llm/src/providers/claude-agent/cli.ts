import { AiProviderError } from "../../ports/errors.js"
import { createCliRequestBudget } from "../shared/cli-request-budget.js"
import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"

export interface ClaudeAgentTextBlock {
  type: "text"
  text: string
}

export interface ClaudeAgentImageBlock {
  type: "image"
  source: { type: "base64"; media_type: string; data: string }
}

export type ClaudeAgentContentBlock = ClaudeAgentTextBlock | ClaudeAgentImageBlock

export interface ClaudeAgentUserMessage {
  type: "user"
  message: { role: "user"; content: ClaudeAgentContentBlock[] }
  parent_tool_use_id: null
}

export interface ClaudeAgentUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface ClaudeAgentResultEvent {
  type: "result"
  subtype?: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: ClaudeAgentUsage
  api_error_status?: number | null
  total_cost_usd?: number
  errors?: string[]
}

export interface ClaudeAgentTurn {
  resultEvent?: ClaudeAgentResultEvent
  exitCode: number
  stderr: string
}

export interface ClaudeCliRequest {
  onProviderRequest?: () => void
  executable: string
  model: string
  userMessage: ClaudeAgentUserMessage
  systemPrompt?: string
  schemaJson?: string
  env: Record<string, string | undefined>
  signal: AbortSignal
  cwd: string
}

export type ClaudeCliRunner = (request: ClaudeCliRequest) => Promise<ClaudeAgentTurn>

/**
 * The verified flag-contract floor: `--json-schema`, `--tools ""`,
 * `--setting-sources ""`, `--system-prompt-file` (shipped in 1.0.55, far
 * below this floor) and `--no-session-persistence` are all present on the
 * 2.1 line. The connection check refuses older CLIs so turns fail there with
 * an actionable message instead of on an unknown flag.
 */
export const MINIMUM_CLAUDE_CLI_VERSION = "2.1.0"

export interface ClaudeCliArgsOptions {
  model: string
  systemPromptPath?: string
  schemaJson?: string
}

/**
 * Headless print mode, fully isolated: no settings sources, no built-in tools,
 * no MCP servers, no session files. stream-json is the only print-mode input
 * format that carries image blocks, and stream-json output requires
 * `--verbose`. Transport retries, structured-output repair and stream fallback
 * are disabled through the child environment so the facade owns those budgets.
 */
export function buildClaudeArgs(options: ClaudeCliArgsOptions): string[] {
  const args = [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    options.model,
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ]

  if (options.systemPromptPath) args.push("--system-prompt-file", options.systemPromptPath)
  if (options.schemaJson) args.push("--json-schema", options.schemaJson)
  return args
}

/**
 * The system prompt embeds a rendered template (and, for non-native
 * strategies, the serialized schema) and routinely exceeds the Windows
 * 32,767-char argv cap, so it travels by file. `--json-schema` has no file
 * variant, but the schemas that reach the native strategy are strict,
 * non-recursive and small.
 */
export const runClaudeCli: ClaudeCliRunner = async (request) => {
  // ADT's registered adapter supports Anthropic key / Claude login. Ambient
  // AWS, Vertex or Foundry selectors choose different authentication protocols
  // and bypass ANTHROPIC_BASE_URL; never silently send unbudgeted paid work.
  const alternate = [
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "CLAUDE_CODE_USE_ANTHROPIC_AWS",
    "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
    "CLAUDE_CODE_USE_MANTLE",
    "CLAUDE_CODE_USE_GATEWAY",
  ].find(
    (name) =>
      request.env[name] && !["0", "false", "no", "off"].includes(request.env[name]!.toLowerCase()),
  )
  if (alternate)
    throw new AiProviderError(
      "unsupported-capability",
      `Claude Agent supports Anthropic API keys or Claude login. Unset ${alternate} for this adapter; alternate backend requests cannot use its bounded transport.`,
      { providerId: "claude-agent", modality: "structured-text", capability: "alternate-backend" },
    )
  let workDir: string | undefined
  let systemPromptPath: string | undefined
  let budget: Awaited<ReturnType<typeof createCliRequestBudget>> | undefined
  try {
    if (request.systemPrompt) {
      workDir = await mkdtemp(join(request.cwd, "adt-claude-"))
      systemPromptPath = join(workDir, "system-prompt.txt")
      await writeFile(systemPromptPath, request.systemPrompt, "utf-8")
    }

    budget = await createCliRequestBudget({
      signal: request.signal,
      env: request.env,
      onProviderRequest: request.onProviderRequest,
      clientTls: {
        ...(request.env.CLAUDE_CODE_CLIENT_CERT
          ? { cert: await readFile(request.env.CLAUDE_CODE_CLIENT_CERT) }
          : {}),
        ...(request.env.CLAUDE_CODE_CLIENT_KEY
          ? { key: await readFile(request.env.CLAUDE_CODE_CLIENT_KEY) }
          : {}),
        ...(request.env.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE
          ? { passphrase: request.env.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE }
          : {}),
      },
      upstream: () => request.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    })
    const args = buildClaudeArgs({
      model: request.model,
      ...(systemPromptPath ? { systemPromptPath } : {}),
      ...(request.schemaJson ? { schemaJson: request.schemaJson } : {}),
    })

    const outcome = await spawnClaudeCommand(
      request.executable,
      args,
      { ...budget.env, ANTHROPIC_BASE_URL: budget.url },
      budget.signal,
      `${JSON.stringify(request.userMessage)}\n`,
      request.cwd,
    )
    budget.check()
    return readClaudeTurn(outcome)
  } catch (error) {
    budget?.check()
    throw error
  } finally {
    await budget?.close()
    // A cleanup failure (Windows can briefly hold the file while a killed
    // child exits) must never mask the turn's own error.
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

export interface ClaudeProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function spawnClaudeCommand(
  executable: string,
  args: string[],
  env: Record<string, string | undefined>,
  signal: AbortSignal,
  stdinData?: string,
  cwd?: string,
): Promise<ClaudeProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      signal,
      ...(cwd ? { cwd } : {}),
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

function describeSpawnFailure(executable: string, cause: unknown): Error {
  const code = (cause as { code?: string }).code
  if (code === "ENOENT") {
    return new Error(
      `Claude Code CLI not found: "${executable}" does not exist. Install Claude Code, or set CLAUDE_AGENT_EXECUTABLE to the executable's full path.`,
      { cause },
    )
  }
  if ((cause as { name?: string }).name === "AbortError") {
    return new Error("Claude Code CLI run was aborted or timed out", { cause })
  }
  return new Error(
    `Claude Code CLI could not be started: ${cause instanceof Error ? cause.message : String(cause)}`,
    { cause },
  )
}

export function isMissingClaudeExecutable(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause
  return cause?.code === "ENOENT"
}

export function readClaudeTurn(result: ClaudeProcessResult): ClaudeAgentTurn {
  let resultEvent: ClaudeAgentResultEvent | undefined

  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("{")) continue
    let event: { type?: string }
    try {
      event = JSON.parse(trimmed) as { type?: string }
    } catch {
      continue
    }
    if (event.type === "result") resultEvent = event as ClaudeAgentResultEvent
  }

  return {
    ...(resultEvent ? { resultEvent } : {}),
    exitCode: result.exitCode,
    stderr: result.stderr,
  }
}
