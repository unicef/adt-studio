import type { ConnectionCheckContext, ProviderConnectionStatus } from "../../ports/index.js"
import {
  isMissingCodexExecutable,
  locateCodexExecutable,
  spawnCodexCommand,
  type CodexProcessResult,
} from "./cli.js"
import { buildCodexEnv } from "./env.js"
import type { CodexCredentials } from "./structured-text.js"

const STATUS_TIMEOUT_MS = 15_000

export type CodexStatusRunner = (
  executable: string,
  args: string[],
  env: Record<string, string>,
  signal: AbortSignal,
) => Promise<CodexProcessResult>

export interface CodexConnectionProbe {
  runCommand?: CodexStatusRunner
  executable?: string
}

/**
 * `codex login status` costs no tokens and is the CLI's own verdict on its
 * authentication, so it is the whole check. Its output is never echoed back: the
 * CLI prints a partially masked key, and the only thing derived from it is a
 * whitelisted auth-mode word.
 */
export async function checkCodexConnection(
  context: ConnectionCheckContext<CodexCredentials>,
  probe: CodexConnectionProbe = {},
): Promise<ProviderConnectionStatus> {
  const apiKey = context.credentials.apiKey?.trim()
  const executable = probe.executable ?? locateCodexExecutable()
  const runCommand = probe.runCommand ?? spawnCodexCommand

  let result: CodexProcessResult
  try {
    result = await runCommand(
      executable,
      ["login", "status"],
      buildCodexEnv(apiKey),
      buildSignal(context.signal),
    )
  } catch (error) {
    if (isMissingCodexExecutable(error)) {
      return {
        ok: false,
        code: "cli-not-found",
        detail: `"${executable}" was not found on PATH, in the common install locations or in the ChatGPT app`,
      }
    }
    return { ok: false, code: "unreachable", detail: "Codex CLI could not be started" }
  }

  if (result.exitCode !== 0) return { ok: false, code: "not-logged-in" }

  const authMode = describeAuthMode(`${result.stdout}\n${result.stderr}`)
  return {
    ok: true,
    code: apiKey ? "ok" : "local-login",
    ...(authMode ? { detail: authMode } : {}),
  }
}

/**
 * Whitelisted, never a slice of the CLI's output — that output contains a masked
 * key. The CLI reports its login on stderr, so both streams are inspected.
 */
function describeAuthMode(output: string): string | undefined {
  if (/api key/i.test(output)) return "API key"
  if (/chatgpt/i.test(output)) return "ChatGPT account"
  return undefined
}

function buildSignal(external: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(STATUS_TIMEOUT_MS)
  return external ? AbortSignal.any([timeout, external]) : timeout
}
