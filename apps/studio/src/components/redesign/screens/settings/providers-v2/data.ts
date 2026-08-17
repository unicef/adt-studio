/* eslint-disable lingui/no-unlocalized-strings -- Manifest copy mirrors server-localized provider data (LocalizedText from /providers), not app UI strings. */
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { AiModality, ProviderDescriptor } from "./contract"

export interface RoleGroup {
  key: string
  label: MessageDescriptor
  hint: MessageDescriptor
  /** Card keys (see PROVIDER_CARDS), not raw provider ids. */
  cards: string[]
}

export const ROLE_GROUPS: RoleGroup[] = [
  {
    key: "reasoning",
    label: msg`Models & reasoning`,
    hint: msg`Which engine runs the extraction and generation pipeline.`,
    cards: ["openai", "anthropic", "google", "custom", "ollama"],
  },
  {
    key: "speech",
    label: msg`Speech & voices`,
    hint: msg`Text-to-speech engines that narrate the finished book.`,
    cards: ["azure", "elevenlabs", "gemini"],
  },
]

/**
 * A card is a vendor, not a backend. Vendors that offer both an API and a local CLI
 * (OpenAI → Codex, Anthropic → Claude Agent) collapse into one card whose CLI ↔ API-key
 * toggle selects which underlying provider you configure. Each mode keeps its own
 * modalities, credentials and connection state; model assignment stays in Settings → Models.
 */
export interface ProviderCardDef {
  key: string
  displayName: string
  uiId: string
  apiKeyProviderId?: string
  cliProviderId?: string
  localProviderId?: string
  cliLabel?: string
}

export const PROVIDER_CARDS: Record<string, ProviderCardDef> = {
  openai: { key: "openai", displayName: "OpenAI", uiId: "openai", apiKeyProviderId: "openai", cliProviderId: "codex", cliLabel: "Codex CLI" },
  anthropic: { key: "anthropic", displayName: "Anthropic", uiId: "anthropic", apiKeyProviderId: "anthropic", cliProviderId: "claude-agent", cliLabel: "Claude Code" },
  google: { key: "google", displayName: "Google", uiId: "google", apiKeyProviderId: "google" },
  custom: { key: "custom", displayName: "Custom (OpenAI-compatible)", uiId: "custom", apiKeyProviderId: "custom" },
  ollama: { key: "ollama", displayName: "Ollama", uiId: "ollama", localProviderId: "ollama" },
  azure: { key: "azure", displayName: "Azure Speech", uiId: "azure", apiKeyProviderId: "azure" },
  elevenlabs: { key: "elevenlabs", displayName: "ElevenLabs", uiId: "elevenlabs", apiKeyProviderId: "elevenlabs" },
  gemini: { key: "gemini", displayName: "Gemini Speech", uiId: "gemini", apiKeyProviderId: "gemini" },
}

const LABEL_API_KEY = { en: "API key" }
const LABEL_BASE_URL = { en: "Base URL" }
const HELP_OPTIONAL_API_KEY = { en: "Optional. Leave empty for servers that do not require authentication." }

export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
  {
    manifest: {
      id: "openai",
      displayName: "OpenAI",
      modalities: ["structured-text", "agent", "image", "tts", "stt"],
      defaultModels: { "structured-text": "gpt-5.4", agent: "gpt-5.4", image: "gpt-image-2", tts: "gpt-4o-mini-tts", stt: "whisper-1" },
      docsUrl: "https://platform.openai.com/api-keys",
      credentialFields: [
        { key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: true, header: "X-OpenAI-Key", storageKey: "adt-studio-openai-key", placeholder: "sk-..." },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "anthropic",
      displayName: "Anthropic",
      modalities: ["structured-text", "agent"],
      defaultModels: { "structured-text": "claude-opus-4", agent: "claude-opus-4" },
      docsUrl: "https://console.anthropic.com/settings/keys",
      credentialFields: [
        { key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: true, header: "X-Anthropic-API-Key", storageKey: "adt-studio-anthropic-key", placeholder: "sk-ant-..." },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "claude-agent",
      displayName: "Claude Agent",
      modalities: ["structured-text"],
      defaultModels: { "structured-text": "claude-sonnet-4-5" },
      docsUrl: "https://code.claude.com/docs/agent-sdk",
      localizedHelp: {
        en: "Runs prompts through the Claude Agent SDK on this machine instead of calling the Anthropic API directly, reusing the Claude Code login when no API key is set. Tools, session files and local settings are disabled so results stay reproducible.",
      },
      credentialFields: [
        {
          key: "apiKey",
          kind: "secret",
          label: LABEL_API_KEY,
          required: false,
          header: "X-ADT-Provider-Claude-Agent-Key",
          storageKey: "adt-studio-claude-agent-key",
          placeholder: "sk-ant-...",
          help: { en: "Optional. Leave empty to use the Claude Code login already on this machine. When filled, requests are billed to this Anthropic API key instead." },
        },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "codex",
      displayName: "OpenAI Codex",
      modalities: ["structured-text"],
      defaultModels: { "structured-text": "gpt-5.1" },
      docsUrl: "https://developers.openai.com/codex/cli",
      localizedHelp: {
        en: "Runs prompts through the Codex CLI installed on this machine, reusing its login when no API key is set. Requires `codex` on PATH (or CODEX_EXECUTABLE) and a `codex login`. The sandbox is read-only.",
      },
      credentialFields: [
        {
          key: "apiKey",
          kind: "secret",
          label: LABEL_API_KEY,
          required: false,
          header: "X-ADT-Provider-Codex-Key",
          storageKey: "adt-studio-codex-key",
          placeholder: "sk-...",
          help: { en: "Optional. Leave empty to use the Codex CLI login already on this machine. When filled, requests are billed to this OpenAI API key instead." },
        },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "google",
      displayName: "Google",
      modalities: ["structured-text", "agent"],
      defaultModels: { "structured-text": "gemini-2.5-pro", agent: "gemini-2.5-pro" },
      docsUrl: "https://aistudio.google.com/app/apikey",
      credentialFields: [
        { key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: true, header: "X-Google-API-Key", storageKey: "adt-studio-google-key" },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "custom",
      displayName: "Custom (OpenAI-compatible)",
      modalities: ["structured-text", "agent"],
      defaultModels: {},
      localizedHelp: { en: "Any OpenAI-compatible endpoint — LM Studio, vLLM, llama.cpp, Together AI." },
      credentialFields: [
        { key: "baseUrl", kind: "url", label: LABEL_BASE_URL, required: true, header: "X-Custom-Base-URL", storageKey: "adt-studio-custom-base-url", placeholder: "http://localhost:1234/v1" },
        { key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: false, header: "X-Custom-API-Key", storageKey: "adt-studio-custom-api-key", help: HELP_OPTIONAL_API_KEY },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [
      { key: "baseUrl", configuredOnServer: false },
      { key: "apiKey", configuredOnServer: false },
    ],
  },
  {
    manifest: {
      id: "ollama",
      displayName: "Ollama",
      modalities: ["structured-text", "agent"],
      defaultModels: {},
      localizedHelp: { en: "Runs models locally with no API key. Point at the Ollama server on this machine." },
      credentialFields: [
        { key: "baseUrl", kind: "url", label: LABEL_BASE_URL, required: false, header: "X-ADT-Provider-Ollama-Base-URL", storageKey: "adt-studio-ollama-base-url", placeholder: "http://127.0.0.1:11434/v1" },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "baseUrl", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "azure",
      displayName: "Azure Speech",
      modalities: ["tts"],
      defaultModels: {},
      credentialFields: [
        { key: "apiKey", kind: "secret", label: { en: "Subscription key" }, required: true, header: "X-Azure-Speech-Key", storageKey: "adt-studio-azure-key" },
        { key: "region", kind: "text", label: { en: "Region" }, required: true, header: "X-Azure-Speech-Region", storageKey: "adt-studio-azure-region", placeholder: "brazilsouth", maxLength: 64 },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [
      { key: "apiKey", configuredOnServer: false },
      { key: "region", configuredOnServer: false },
    ],
  },
  {
    manifest: {
      id: "elevenlabs",
      displayName: "ElevenLabs",
      modalities: ["tts"],
      defaultModels: { tts: "eleven_multilingual_v2" },
      docsUrl: "https://elevenlabs.io/app/settings/api-keys",
      credentialFields: [
        { key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: true, header: "X-ElevenLabs-API-Key", storageKey: "adt-studio-elevenlabs-key" },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
  {
    manifest: {
      id: "gemini",
      displayName: "Gemini Speech",
      modalities: ["tts"],
      defaultModels: {},
      docsUrl: "https://aistudio.google.com/app/apikey",
      credentialFields: [
        { key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: true, header: "X-Gemini-API-Key", storageKey: "adt-studio-gemini-key", placeholder: "AIza..." },
      ],
    },
    configuredOnServer: false,
    fieldStatus: [{ key: "apiKey", configuredOnServer: false }],
  },
]

export const DEFAULT_MODELS: Record<AiModality, string> = {
  "structured-text": "openai:gpt-5.4",
  agent: "openai:gpt-5.4",
  image: "openai:gpt-image-2",
  tts: "openai:gpt-4o-mini-tts",
  stt: "openai:whisper-1",
}

/**
 * Simulated machine environment for the mock health probe — stands in for what the
 * real `checkProviderConnection` detects (local CLI logins, reachable local servers).
 * Seeded to show a spread of states across the variants for design review.
 */
export interface SimEnv {
  cliInstalled?: boolean
  cliLoggedIn?: boolean
  loginLabel?: string
  reachable?: boolean
  rejectsKey?: boolean
  modelCount?: number
}

export const SIM_ENV: Record<string, SimEnv> = {
  openai: { modelCount: 62 },
  anthropic: { modelCount: 9 },
  "claude-agent": { cliInstalled: true, cliLoggedIn: true, loginLabel: "Claude Team account", modelCount: 7 },
  codex: { cliInstalled: true, cliLoggedIn: false, loginLabel: "ChatGPT account" },
  google: { modelCount: 48 },
  custom: { reachable: false },
  ollama: { reachable: true, modelCount: 11 },
  azure: {},
  elevenlabs: { rejectsKey: true },
  gemini: {},
}

/** Credentials seeded on first load so the review shows connected states, not an empty screen. */
export const SEED_CREDENTIALS: Record<string, Record<string, string>> = {
  openai: { apiKey: "sk-proto-demo-openai-key-000" },
  ollama: { baseUrl: "http://127.0.0.1:11434/v1" },
  elevenlabs: { apiKey: "sk-proto-bad-key" },
}
