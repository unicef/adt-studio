import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Cloud, HardDrive, Server, type LucideIcon, SquareTerminal } from "lucide-react";
import openaiLogo from "@/assets/providers/openai.svg?raw";
import anthropicLogo from "@/assets/providers/anthropic.svg?raw";
import claudeLogo from "@/assets/providers/claude.svg?raw";
import geminiLogo from "@/assets/providers/gemini.svg?raw";
import ollamaLogo from "@/assets/providers/ollama.svg?raw";
import elevenLabsLogo from "@/assets/providers/elevenlabs.svg?raw";

export type ProviderEntry = {
  name: string;
  note: MessageDescriptor;
  svg?: string;
  icon?: LucideIcon;
  color: string;
};

export type ProviderGroup = {
  key: string;
  title: MessageDescriptor;
  blurb: MessageDescriptor;
  entries: ProviderEntry[];
};

/** Mirrors the providers the Studio ships with (apps/studio settings → AI providers). */
export const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    key: "subscription",
    title: msg`Sign in with a subscription`,
    blurb: msg`Use the coding-agent plan you already pay for. No API key needed.`,
    entries: [
      { name: "Codex", note: msg`Sign in with your OpenAI account`, icon: SquareTerminal, color: "#0f172a" },
      { name: "Claude Code", note: msg`Sign in with your Anthropic account`, svg: claudeLogo, color: "#d97757" },
    ],
  },
  {
    key: "api",
    title: msg`Bring an API key`,
    blurb: msg`Pay per call, pick any model the provider offers.`,
    entries: [
      { name: "OpenAI", note: msg`GPT models, image generation, speech`, svg: openaiLogo, color: "#0f172a" },
      { name: "Anthropic", note: msg`Claude models`, svg: anthropicLogo, color: "#d97757" },
      { name: "Google Gemini", note: msg`Gemini models and speech`, svg: geminiLogo, color: "#1c69ff" },
      { name: "OpenAI-compatible", note: msg`Any endpoint that speaks the OpenAI API`, icon: Server, color: "#475569" },
    ],
  },
  {
    key: "local",
    title: msg`Run locally`,
    blurb: msg`Keep everything on the machine, including the model.`,
    entries: [
      { name: "Ollama", note: msg`Open models on your own hardware`, svg: ollamaLogo, color: "#0f172a" },
      { name: "Your books folder", note: msg`Nothing leaves the machine unless you pick a cloud provider`, icon: HardDrive, color: "#475569" },
    ],
  },
  {
    key: "speech",
    title: msg`Speech and voices`,
    blurb: msg`Narration voices from the provider you prefer.`,
    entries: [
      { name: "Azure Speech", note: msg`Neural voices in 140+ languages`, icon: Cloud, color: "#0078d4" },
      { name: "ElevenLabs", note: msg`Expressive, cloneable voices`, svg: elevenLabsLogo, color: "#0f172a" },
      { name: "OpenAI", note: msg`Text-to-speech voices`, svg: openaiLogo, color: "#0f172a" },
      { name: "Gemini", note: msg`Multilingual speech`, svg: geminiLogo, color: "#1c69ff" },
    ],
  },
];
