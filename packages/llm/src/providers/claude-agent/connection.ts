import type { ConnectionCheckContext, ProviderConnectionStatus } from "../../ports/index.js"
import { listAnthropicModels } from "../shared/anthropic-rest/models.js"
import { claudeCliCredentialPaths, hasLocalCliLogin } from "../shared/local-cli-auth.js"
import {
  isMissingClaudeExecutable,
  MINIMUM_CLAUDE_CLI_VERSION,
  spawnClaudeCommand,
  type ClaudeProcessResult,
} from "./cli.js"
import {
  MISSING_CLAUDE_CLI_MESSAGE,
  resolveClaudeAgentExecutable,
} from "./executable.js"
import { buildClaudeAgentEnv, type ClaudeAgentCredentials } from "./structured-text.js"

const STATUS_TIMEOUT_MS = 15_000

export type ClaudeVersionRunner = (
  executable: string,
  args: string[],
  env: Record<string, string | undefined>,
  signal: AbortSignal,
) => Promise<ClaudeProcessResult>

export interface ClaudeAgentConnectionProbe {
  runCommand?: ClaudeVersionRunner
  resolveExecutable?: () => string | undefined
  hasLogin?: () => boolean
  listModels?: (apiKey: string, signal?: AbortSignal) => Promise<{ id: string }[]>
}

/**
 * Every turn spawns the `claude` executable, so its availability and version
 * are checked first regardless of credentials — `claude --version` costs no
 * tokens and proves the flag contract this provider relies on. With an API key
 * the rest of the check is a real catalogue call. Without one the CLI
 * authenticates through its own login, which cannot be verified without
 * spending a turn — so the probe confirms a login file exists (existence only;
 * the file is never opened).
 */
export async function checkClaudeAgentConnection(
  context: ConnectionCheckContext<ClaudeAgentCredentials>,
  probe: ClaudeAgentConnectionProbe = {},
): Promise<ProviderConnectionStatus> {
  const executable = (probe.resolveExecutable ?? resolveClaudeAgentExecutable)()
  if (!executable) {
    return { ok: false, code: "cli-not-found", detail: MISSING_CLAUDE_CLI_MESSAGE }
  }

  const runCommand = probe.runCommand ?? spawnClaudeCommand
  let result: ClaudeProcessResult
  try {
    result = await runCommand(
      executable,
      ["--version"],
      buildClaudeAgentEnv(undefined),
      buildSignal(context.signal),
    )
  } catch (error) {
    if (isMissingClaudeExecutable(error)) {
      return { ok: false, code: "cli-not-found", detail: `"${executable}" does not exist` }
    }
    return {
      ok: false,
      code: "unreachable",
      detail: "Claude Code CLI could not be started",
    }
  }

  const version = parseCliVersion(result.stdout)
  if (result.exitCode !== 0 || !version) {
    return {
      ok: false,
      code: "unreachable",
      detail: "Claude Code CLI did not report a version",
    }
  }
  if (compareVersions(version, MINIMUM_CLAUDE_CLI_VERSION) < 0) {
    return {
      ok: false,
      code: "cli-not-found",
      detail: `Claude Code ${version} is older than the minimum ${MINIMUM_CLAUDE_CLI_VERSION} — run \`claude update\``,
    }
  }

  const apiKey = context.credentials.apiKey?.trim()
  if (apiKey) {
    const listModels =
      probe.listModels ??
      ((key, signal) => listAnthropicModels({ apiKey: key, signal }))
    const models = await listModels(apiKey, context.signal)
    return { ok: true, code: "ok", modelCount: models.length }
  }

  const hasLogin = probe.hasLogin ?? (() => hasLocalCliLogin(claudeCliCredentialPaths()))
  return hasLogin()
    ? { ok: true, code: "local-login", detail: `Claude Code ${version}` }
    : { ok: false, code: "not-logged-in" }
}

function parseCliVersion(stdout: string): string | undefined {
  return /(\d+)\.(\d+)\.(\d+)/.exec(stdout)?.[0]
}

function compareVersions(left: string, right: string): number {
  const parse = (version: string): number[] => version.split(".").map(Number)
  const [a, b] = [parse(left), parse(right)]
  for (let i = 0; i < 3; i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function buildSignal(external: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(STATUS_TIMEOUT_MS)
  return external ? AbortSignal.any([timeout, external]) : timeout
}
