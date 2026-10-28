import { cn } from "@/lib/utils"

export type NoticeTone = "attention" | "critical"

export const TONE_BORDER: Record<NoticeTone, string> = {
  attention: cn("border-[color-mix(in_srgb,var(--tint,var(--chrome-hex,#d97706))_35%,transparent)]"),
  critical: cn("border-destructive/40"),
}

export const TONE_ICON: Record<NoticeTone, string> = {
  attention: cn("text-[var(--tint,var(--chrome-hex,#d97706))] dark:text-[color-mix(in_oklab,var(--tint,var(--chrome-hex,#d97706))_70%,white)]"),
  critical: cn("text-destructive"),
}

export const TONE_TEXT: Record<NoticeTone, string> = {
  attention: cn(
    "text-[color-mix(in_oklab,var(--tint,var(--chrome-hex,#d97706))_80%,black)]",
    "dark:text-[color-mix(in_oklab,var(--tint,var(--chrome-hex,#d97706))_70%,white)]",
  ),
  critical: cn("text-destructive"),
}

export const TONE_BUTTON: Record<NoticeTone, string> = {
  attention: cn(
    "bg-[color-mix(in_oklab,var(--tint,var(--chrome-hex,#d97706))_80%,black)] text-white hover:bg-[color-mix(in_oklab,var(--tint,var(--chrome-hex,#d97706))_70%,black)]",
  ),
  critical: cn("bg-destructive text-white hover:bg-destructive/90"),
}
