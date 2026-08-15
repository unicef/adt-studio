import { Server, Cloud, type LucideIcon } from "lucide-react"
import openaiLogo from "@/assets/providers/openai.svg"
import anthropicLogo from "@/assets/providers/anthropic.svg"
import claudeLogo from "@/assets/providers/claude.svg"
import googleLogo from "@/assets/providers/google.svg"
import geminiLogo from "@/assets/providers/gemini.svg"
import elevenLabsLogo from "@/assets/providers/elevenlabs.svg"
import ollamaLogo from "@/assets/providers/ollama.svg"

/**
 * Real brand marks (vendored monochrome SVGs from simple-icons) rendered as CSS masks so the
 * glyph inherits `currentColor` and stays legible in both themes. `glyph` sets that color;
 * `tile` sets the container wash. Azure's mark was removed from simple-icons, so it falls back
 * to a tinted Cloud lucide glyph. Keyed by vendor id and backend id.
 */
export interface Brand {
  logo?: string
  icon?: LucideIcon
  glyph: string
  tile: string
}

export const PROVIDER_BRAND: Record<string, Brand> = {
  openai: { logo: openaiLogo, glyph: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/10" },
  codex: { logo: openaiLogo, glyph: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/10" },
  anthropic: { logo: anthropicLogo, glyph: "text-[#d97757]", tile: "bg-[#d97757]/12" },
  "claude-agent": { logo: claudeLogo, glyph: "text-[#d97757]", tile: "bg-[#d97757]/12" },
  google: { logo: googleLogo, glyph: "text-[#4285f4]", tile: "bg-[#4285f4]/12" },
  gemini: { logo: geminiLogo, glyph: "text-[#1c69ff]", tile: "bg-[#1c69ff]/12" },
  azure: { icon: Cloud, glyph: "text-[#0078d4]", tile: "bg-[#0078d4]/12" },
  elevenlabs: { logo: elevenLabsLogo, glyph: "text-foreground", tile: "bg-muted" },
  ollama: { logo: ollamaLogo, glyph: "text-foreground", tile: "bg-muted" },
  custom: { icon: Server, glyph: "text-muted-foreground", tile: "bg-muted" },
}
