import { useCallback, useMemo } from "react"
import { Sparkles, Server, AudioLines, type LucideIcon } from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useApiKey } from "@/hooks/use-api-key"

export type ProviderId = "openai" | "anthropic" | "google" | "custom" | "azure"

export interface ProviderField {
  id: string
  label: MessageDescriptor
  placeholder: MessageDescriptor
  secret: boolean
  value: string
  save: (value: string) => void
  validate?: (value: string) => MessageDescriptor | null
}

export interface ProviderCard {
  id: ProviderId
  name: string
  desc: MessageDescriptor
  hint?: MessageDescriptor
  icon: LucideIcon
  tile: string
  connected: boolean
  summary: string
  fields: ProviderField[]
}

export function mask(key: string): string {
  if (!key) return ""
  const tail = key.slice(-4)
  const head = key.startsWith("sk-ant") ? "sk-ant-" : key.startsWith("sk-") ? "sk-" : ""
  return `${head}••••${tail}`
}

function validateOpenAIKey(value: string): MessageDescriptor | null {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.startsWith("sk-")) return null
  return msg`Key must start with "sk-"`
}

export function useProviderCards(): ProviderCard[] {
  const {
    apiKey,
    setApiKey,
    anthropicKey,
    setAnthropicKey,
    googleKey,
    setGoogleKey,
    setGeminiKey,
    customBaseUrl,
    setCustomBaseUrl,
    customApiKey,
    setCustomApiKey,
    azureKey,
    setAzureKey,
    azureRegion,
    setAzureRegion,
  } = useApiKey()

  const saveGoogleKey = useCallback(
    (key: string) => {
      setGoogleKey(key)
      setGeminiKey(key)
    },
    [setGoogleKey, setGeminiKey],
  )

  return useMemo(
    () => [
      {
        id: "openai",
        name: "OpenAI",
        desc: msg`GPT models for pipeline tasks.`,
        icon: Sparkles,
        tile: "bg-emerald-50 text-emerald-600",
        connected: apiKey.length > 0,
        summary: mask(apiKey),
        fields: [
          {
            id: "openai-key-input",
            label: msg`OpenAI API Key`,
            placeholder: msg`sk-...`,
            secret: true,
            value: apiKey,
            save: setApiKey,
            validate: validateOpenAIKey,
          },
        ],
      },
      {
        id: "anthropic",
        name: "Anthropic",
        desc: msg`Claude models — Opus, Sonnet.`,
        hint: msg`Used for Claude models (claude-opus-4-6, claude-sonnet-4-6, etc.)`,
        icon: Sparkles,
        tile: "bg-amber-50 text-amber-600",
        connected: anthropicKey.length > 0,
        summary: mask(anthropicKey),
        fields: [
          {
            id: "anthropic-key-input",
            label: msg`Anthropic API Key`,
            placeholder: msg`sk-ant-...`,
            secret: true,
            value: anthropicKey,
            save: setAnthropicKey,
          },
        ],
      },
      {
        id: "google",
        name: "Google AI",
        desc: msg`Gemini — LLM and TTS voices.`,
        hint: msg`Used for Gemini models — both LLM (gemini-2.5-pro, etc.) and TTS (gemini-2.5-pro-preview-tts, etc.)`,
        icon: Sparkles,
        tile: "bg-blue-50 text-blue-600",
        connected: googleKey.length > 0,
        summary: mask(googleKey),
        fields: [
          {
            id: "google-key-input",
            label: msg`Google AI API Key`,
            placeholder: msg`AIza...`,
            secret: true,
            value: googleKey,
            save: saveGoogleKey,
          },
        ],
      },
      {
        id: "custom",
        name: "Custom (OpenAI-compatible)",
        desc: msg`Ollama, vLLM, Together AI — any compatible endpoint.`,
        hint: msg`Any OpenAI-compatible endpoint (Ollama, vLLM, Together AI, etc.). Use the "custom:" prefix when selecting models, e.g. custom:llama3.`,
        icon: Server,
        tile: "bg-muted text-muted-foreground",
        connected: customBaseUrl.length > 0 || customApiKey.length > 0,
        summary: customBaseUrl,
        fields: [
          {
            id: "custom-base-url-input",
            label: msg`Base URL`,
            placeholder: msg`e.g. http://localhost:11434/v1`,
            secret: false,
            value: customBaseUrl,
            save: setCustomBaseUrl,
          },
          {
            id: "custom-api-key-input",
            label: msg`API Key (optional)`,
            placeholder: msg`Leave empty if not required`,
            secret: true,
            value: customApiKey,
            save: setCustomApiKey,
          },
        ],
      },
      {
        id: "azure",
        name: "Azure Speech",
        desc: msg`Azure TTS voices · subscription key + region.`,
        hint: msg`Used for Azure Speech TTS provider.`,
        icon: AudioLines,
        tile: "bg-indigo-50 text-indigo-600",
        connected: azureKey.length > 0,
        summary: mask(azureKey),
        fields: [
          {
            id: "azure-key-input",
            label: msg`Azure Speech Subscription Key`,
            placeholder: msg`Azure Speech subscription key`,
            secret: true,
            value: azureKey,
            save: setAzureKey,
          },
          {
            id: "azure-region-input",
            label: msg`Region`,
            placeholder: msg`e.g. eastus, westeurope`,
            secret: false,
            value: azureRegion,
            save: setAzureRegion,
          },
        ],
      },
    ],
    [
      apiKey,
      setApiKey,
      anthropicKey,
      setAnthropicKey,
      googleKey,
      saveGoogleKey,
      customBaseUrl,
      setCustomBaseUrl,
      customApiKey,
      setCustomApiKey,
      azureKey,
      setAzureKey,
      azureRegion,
      setAzureRegion,
    ],
  )
}
