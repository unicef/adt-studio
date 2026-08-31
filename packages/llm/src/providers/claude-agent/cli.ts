import { spawn } from "node:child_process"

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
  total_cost_usd?: number
  errors?: string[]
}

export interface ClaudeAgentTurn {
  resultEvent?: ClaudeAgentResultEvent
  exitCode: number
  stderr: string
}

export interface ClaudeCliRequest {
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
 * `--setting-sources ""`, `--system-prompt` and `--no-session-persistence` are
 * all present on the 2.1 line. The connection check refuses older CLIs so
 * turns fail there with an actionable message instead of on an unknown flag.
 */
export const MINIMUM_CLAUDE_CLI_VERSION = "2.1.0"

export interface ClaudeCliArgsOptions {
  model: string
  systemPrompt?: string
  schemaJson?: string
}

/**
 * Headless print mode, fully isolated: no settings sources, no built-in tools,
 * no MCP servers, no session files. stream-json is the only print-mode input
 * format that carries image blocks, and stream-json output requires
 * `--verbose`. Without tools a user turn cannot fan out, so no turn cap is
 * needed.
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

  if (options.systemPrompt) args.push("--system-prompt", options.systemPrompt)
  if (options.schemaJson) args.push("--json-schema", options.schemaJson)
  return args
}

export const runClaudeCli: ClaudeCliRunner = async (request) => {
  const args = buildClaudeArgs({
    model: request.model,
    ...(request.systemPrompt ? { systemPrompt: request.systemPrompt } : {}),
    ...(request.schemaJson ? { schemaJson: request.schemaJson } : {}),
  })

  const outcome = await spawnClaudeCommand(
    request.executable,
    args,
    request.env,
    request.signal,
    `${JSON.stringify(request.userMessage)}\n`,
    request.cwd,
  )
  return readClaudeTurn(outcome)
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
