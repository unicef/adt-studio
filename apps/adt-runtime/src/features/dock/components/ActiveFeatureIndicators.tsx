import { useAtomValue } from "jotai"
import { BookOpenText, Hand, Highlighter, Volume2, type LucideIcon } from "lucide-react"
import { readAloudModeAtom } from "@/features/audio/state/audio.atoms"
import {
  easyReadModeAtom,
  glossaryModeAtom,
  signLanguageModeAtom,
} from "@/shared/state/ui.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { cn } from "@/shared/lib/utils"

/** Compact, non-interactive status row surfacing which reading features are
 *  currently ON, so it's readable on the collapsed mobile bar without opening
 *  the Tools sheet. Renders nothing when no feature is active. */
export function ActiveFeatureIndicators({ className }: { className?: string }) {
  const { t } = useTranslation()
  const glossaryHighlight = useAtomValue(glossaryModeAtom)
  const readAloud = useAtomValue(readAloudModeAtom)
  const easyRead = useAtomValue(easyReadModeAtom)
  const signLanguage = useAtomValue(signLanguageModeAtom)

  const active: Array<{ key: string; icon: LucideIcon; label: string }> = []
  if (glossaryHighlight) {
    active.push({ key: "glossary", icon: Highlighter, label: t("glossary-highlight-words") || "Highlight words" })
  }
  if (readAloud) {
    active.push({ key: "tts", icon: Volume2, label: t("tts-label") || "Text to speech" })
  }
  if (easyRead) {
    active.push({ key: "easy-read", icon: BookOpenText, label: t("easy-read-label") || "Easy read" })
  }
  if (signLanguage) {
    active.push({ key: "sign", icon: Hand, label: t("sign-language-label") || "Sign language" })
  }

  if (active.length === 0) return null

  return (
    <div
      role="status"
      aria-label={active.map((a) => a.label).join(", ")}
      className={cn("flex items-center gap-1", className)}
    >
      {active.map(({ key, icon: Icon }) => (
        <span
          key={key}
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors"
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      ))}
    </div>
  )
}
