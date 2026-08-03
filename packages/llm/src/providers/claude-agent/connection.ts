import type { ConnectionCheckContext, ProviderConnectionStatus } from "../../ports/index.js"
import { listAnthropicModels } from "../shared/anthropic-rest/models.js"
import { claudeCliCredentialPaths, hasLocalCliLogin } from "../shared/local-cli-auth.js"
import { loadClaudeAgentQuery } from "./sdk.js"
import type { ClaudeAgentCredentials } from "./structured-text.js"

export interface ClaudeAgentConnectionProbe {
  loadSdk?: () => Promise<unknown>
  hasLogin?: () => boolean
  listModels?: (apiKey: string, signal?: AbortSignal) => Promise<{ id: string }[]>
}

/**
 * With an API key the check is a real catalogue call. Without one the SDK
 * authenticates through the Claude Code login, which cannot be verified without
 * spending a turn — so the probe confirms the SDK is installed and a login file
 * exists (existence only; the file is never opened).
 */
export async function checkClaudeAgentConnection(
  context: ConnectionCheckContext<ClaudeAgentCredentials>,
  probe: ClaudeAgentConnectionProbe = {},
): Promise<ProviderConnectionStatus> {
  const apiKey = context.credentials.apiKey?.trim()

  if (apiKey) {
    const listModels =
      probe.listModels ??
      ((key, signal) => listAnthropicModels({ apiKey: key, signal }))
    const models = await listModels(apiKey, context.signal)
    return { ok: true, code: "ok", modelCount: models.length }
  }

  const loadSdk = probe.loadSdk ?? loadClaudeAgentQuery
  try {
    await loadSdk()
  } catch {
    return {
      ok: false,
      code: "cli-not-found",
      detail: "@anthropic-ai/claude-agent-sdk is not installed on this server",
    }
  }

  const hasLogin = probe.hasLogin ?? (() => hasLocalCliLogin(claudeCliCredentialPaths()))
  return hasLogin()
    ? { ok: true, code: "local-login" }
    : { ok: false, code: "not-logged-in" }
}
