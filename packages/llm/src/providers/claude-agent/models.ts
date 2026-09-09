import type { DiscoveredModel, ModelListContext } from "../../ports/index.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { hasClaudeCliLogin } from "../shared/local-cli-auth.js"
import type { ClaudeAgentCredentials } from "./structured-text.js"

export interface ClaudeAgentModelDiscoveryProbe {
  hasLogin?: () => boolean
}

/**
 * The CLI login is not an API credential and `claude` has no model-listing
 * command, so there is no catalogue to ask without a key. The CLI's stable
 * family aliases are served instead — each always resolves to the latest model
 * of its family, so the list does not rot with releases.
 */
const CLI_MODEL_ALIASES: readonly DiscoveredModel[] = [
  { id: "sonnet", displayName: "Claude Sonnet (latest)" },
  { id: "opus", displayName: "Claude Opus (latest)" },
  { id: "haiku", displayName: "Claude Haiku (latest)" },
]

export function listClaudeAgentModels(
  context: ModelListContext<ClaudeAgentCredentials>,
  probe: ClaudeAgentModelDiscoveryProbe = {},
): Promise<DiscoveredModel[]> {
  const apiKey = context.credentials.apiKey
  const hasLogin = probe.hasLogin ?? (() => hasClaudeCliLogin())
  if (!apiKey && !hasLogin()) {
    return Promise.reject(
      new ModelDiscoveryError(
        "missing-credential",
        "No API key is configured and no Claude CLI login was found — run `claude login` on this machine or set an API key",
      ),
    )
  }

  return Promise.resolve([...CLI_MODEL_ALIASES])
}
