import type { DiscoveredModel, ModelListContext } from "../../ports/index.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { codexCliCredentialPaths, hasLocalCliLogin } from "../shared/local-cli-auth.js"
import type { CodexCredentials } from "./structured-text.js"

export interface CodexModelDiscoveryProbe {
  hasLogin?: () => boolean
}

/**
 * The Codex CLI has no model-listing command, so the current generation is
 * served as a curated list (verified against the presets embedded in the
 * CLI binary). Advisory only — an explicitly typed model id still reaches
 * `codex exec --model` unchanged, so newer models work before this list
 * catches up.
 */
const CODEX_CLI_MODELS: readonly DiscoveredModel[] = [
  { id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol" },
  { id: "gpt-5.6-terra", displayName: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", displayName: "GPT-5.6 Luna" },
  { id: "gpt-5.6-pro", displayName: "GPT-5.6 Pro" },
  { id: "gpt-5.5", displayName: "GPT-5.5" },
  { id: "gpt-5.3-codex", displayName: "GPT-5.3 Codex" },
]

export function listCodexModels(
  context: ModelListContext<CodexCredentials>,
  probe: CodexModelDiscoveryProbe = {},
): Promise<DiscoveredModel[]> {
  const apiKey = context.credentials.apiKey
  const hasLogin = probe.hasLogin ?? (() => hasLocalCliLogin(codexCliCredentialPaths()))
  if (!apiKey && !hasLogin()) {
    return Promise.reject(
      new ModelDiscoveryError(
        "missing-credential",
        "No API key is configured and no Codex CLI login was found — run `codex login` on this machine or set an API key",
      ),
    )
  }

  return Promise.resolve([...CODEX_CLI_MODELS])
}
