import { Sparkles, Server, AudioLines, type LucideIcon } from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export type ProviderId = "openai" | "anthropic" | "google" | "custom" | "azure"

export interface ProviderMeta {
  name: string
  desc: MessageDescriptor
  hint?: MessageDescriptor
  icon: LucideIcon
  tile: string
}

export const PROVIDER_IDS = ["openai", "anthropic", "google", "custom", "azure"] as const satisfies readonly ProviderId[]

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  openai: {
    name: "OpenAI",
    desc: msg`GPT models for pipeline tasks.`,
    icon: Sparkles,
    tile: "bg-emerald-50 text-emerald-600",
  },
  anthropic: {
    name: "Anthropic",
    desc: msg`Claude models — Opus, Sonnet.`,
    hint: msg`Used for Claude models (claude-opus-4-6, claude-sonnet-4-6, etc.)`,
    icon: Sparkles,
    tile: "bg-amber-50 text-amber-600",
  },
  google: {
    name: "Google AI",
    desc: msg`Gemini — LLM and TTS voices.`,
    hint: msg`Used for Gemini models — both LLM (gemini-2.5-pro, etc.) and TTS (gemini-2.5-pro-preview-tts, etc.)`,
    icon: Sparkles,
    tile: "bg-blue-50 text-blue-600",
  },
  custom: {
    name: "Custom (OpenAI-compatible)",
    desc: msg`Ollama, vLLM, Together AI — any compatible endpoint.`,
    hint: msg`Any OpenAI-compatible endpoint (Ollama, vLLM, Together AI, etc.). Use the "custom:" prefix when selecting models, e.g. custom:llama3.`,
    icon: Server,
    tile: "bg-muted text-muted-foreground",
  },
  azure: {
    name: "Azure Speech",
    desc: msg`Azure TTS voices · subscription key + region.`,
    hint: msg`Used for Azure Speech TTS provider.`,
    icon: AudioLines,
    tile: "bg-indigo-50 text-indigo-600",
  },
}
