import { Server, Cloud, type LucideIcon } from "lucide-react"
import openaiLogo from "@/assets/providers/openai.svg?raw"
import anthropicLogo from "@/assets/providers/anthropic.svg?raw"
import claudeLogo from "@/assets/providers/claude.svg?raw"
import googleLogo from "@/assets/providers/google.svg?raw"
import geminiLogo from "@/assets/providers/gemini.svg?raw"
import elevenLabsLogo from "@/assets/providers/elevenlabs.svg?raw"
import ollamaLogo from "@/assets/providers/ollama.svg?raw"

/**
 * Real brand marks (vendored monochrome SVGs from simple-icons). Imported as raw markup and
 * inlined so the path fills with `currentColor` (`fill-current`) — the glyph inherits the
 * theme-aware brand color set by `glyph`, and `tile` sets the container wash. Azure's mark was
 * removed from simple-icons, so it falls back to a tinted Cloud lucide glyph.
 */
export interface Brand {
  logoSvg?: string
  icon?: LucideIcon
  glyph: string
  tile: string
}

export const PROVIDER_BRAND: Record<string, Brand> = {
  openai: { logoSvg: openaiLogo, glyph: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/10" },
  codex: { logoSvg: openaiLogo, glyph: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/10" },
  anthropic: { logoSvg: anthropicLogo, glyph: "text-[#d97757]", tile: "bg-[#d97757]/12" },
  "claude-agent": { logoSvg: claudeLogo, glyph: "text-[#d97757]", tile: "bg-[#d97757]/12" },
  google: { logoSvg: googleLogo, glyph: "text-[#4285f4]", tile: "bg-[#4285f4]/12" },
  gemini: { logoSvg: geminiLogo, glyph: "text-[#1c69ff]", tile: "bg-[#1c69ff]/12" },
  azure: { icon: Cloud, glyph: "text-[#0078d4]", tile: "bg-[#0078d4]/12" },
  elevenlabs: { logoSvg: elevenLabsLogo, glyph: "text-foreground", tile: "bg-muted" },
  ollama: { logoSvg: ollamaLogo, glyph: "text-foreground", tile: "bg-muted" },
  custom: { icon: Server, glyph: "text-muted-foreground", tile: "bg-muted" },
}
