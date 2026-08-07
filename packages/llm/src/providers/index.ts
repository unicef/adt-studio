import { createProviderRegistry, type ProviderRegistry } from "../registry.js"
import type { AnyProviderModule } from "../ports/index.js"
import { openaiProvider } from "./openai/index.js"
import { anthropicProvider } from "./anthropic/index.js"
import { claudeAgentProvider } from "./claude-agent/index.js"
import { codexProvider } from "./codex/index.js"
import { googleProvider } from "./google/index.js"
import { customProvider } from "./custom/index.js"
import { ollamaProvider } from "./ollama/index.js"
import { azureProvider } from "./azure/index.js"
import { elevenLabsProvider } from "./elevenlabs/index.js"
import { geminiProvider } from "./gemini/index.js"

export { openaiProvider, openaiManifest, OPENAI_PROVIDER_ID } from "./openai/index.js"
export {
  anthropicProvider,
  anthropicManifest,
  ANTHROPIC_PROVIDER_ID,
} from "./anthropic/index.js"
export {
  claudeAgentProvider,
  claudeAgentManifest,
  CLAUDE_AGENT_PROVIDER_ID,
} from "./claude-agent/index.js"
export { codexProvider, codexManifest, CODEX_PROVIDER_ID } from "./codex/index.js"
export { googleProvider, googleManifest, GOOGLE_PROVIDER_ID } from "./google/index.js"
export { customProvider, customManifest, CUSTOM_PROVIDER_ID } from "./custom/index.js"
export {
  ollamaProvider,
  ollamaManifest,
  OLLAMA_PROVIDER_ID,
  OLLAMA_DEFAULT_BASE_URL,
} from "./ollama/index.js"
export { azureProvider, azureManifest, AZURE_PROVIDER_ID } from "./azure/index.js"
export {
  elevenLabsProvider,
  elevenLabsManifest,
  ELEVENLABS_PROVIDER_ID,
} from "./elevenlabs/index.js"
export { geminiProvider, geminiManifest, GEMINI_PROVIDER_ID } from "./gemini/index.js"

/** Registration order is the display order in the Studio credential UI. */
export const BUILT_IN_PROVIDERS: readonly AnyProviderModule[] = [
  openaiProvider as AnyProviderModule,
  anthropicProvider as AnyProviderModule,
  claudeAgentProvider as AnyProviderModule,
  codexProvider as AnyProviderModule,
  googleProvider as AnyProviderModule,
  customProvider as AnyProviderModule,
  ollamaProvider as AnyProviderModule,
  azureProvider as AnyProviderModule,
  elevenLabsProvider as AnyProviderModule,
  geminiProvider as AnyProviderModule,
]

export function createDefaultProviderRegistry(
  modules: readonly AnyProviderModule[] = BUILT_IN_PROVIDERS,
): ProviderRegistry {
  const registry = createProviderRegistry()
  for (const module of modules) registry.register(module)
  return registry.freeze()
}

let defaultRegistry: ProviderRegistry | undefined

/** Lazy so importing this module has no side effects. */
export function getDefaultProviderRegistry(): ProviderRegistry {
  defaultRegistry ??= createDefaultProviderRegistry()
  return defaultRegistry
}
