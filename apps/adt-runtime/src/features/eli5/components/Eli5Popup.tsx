import { useAtom, useAtomValue } from "jotai"
import { Sparkles } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { eli5ModeAtom, eli5PopupOpenAtom } from "@/shared/state/ui.atoms"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"

/**
 * "Explain to me" popup. Lifts content from the section's `_eli5` translation
 * key (legacy: `<section data-id="sectioneli5{sectionId}">`). When the
 * eli5 toggle is off the trigger is hidden, mirroring base.js behavior.
 */
export function Eli5Popup() {
  const features = useAtomValue(appConfigAtom).features
  const eli5Active = useAtomValue(eli5ModeAtom)
  const [open, setOpen] = useAtom(eli5PopupOpenAtom)
  const translations = useAtomValue(translationsAtom)
  const sectionId = useAtomValue(currentSectionIdAtom)
  const { t } = useTranslation()

  if (!features.eli5 || !eli5Active) return null

  const text =
    (sectionId && translations[`sectioneli5${sectionId}`]) ??
    translations[`${sectionId}_eli5`] ??
    t("eli5-no-content") ??
    "No explanation available."

  const eli5Label = t("eli5-aria-label") || "Explain to me"
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <DialogTrigger
          render={
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={eli5Label}
                  title={eli5Label}
                  className="fixed bottom-[18rem] right-4 w-12 h-12 flex items-center justify-center rounded-full bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60 focus:outline-none focus:ring-4 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-lg z-[55]"
                >
                  <Sparkles className="w-6 h-6 text-yellow-600 dark:text-yellow-300" aria-hidden="true" />
                </button>
              }
            />
          }
        />
        <TooltipContent side="left">{eli5Label}</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-3xl rounded-full bg-yellow-100 dark:bg-yellow-900/40 w-12 h-12 flex items-center justify-center">
              ✨
            </span>
            <span className="sr-only">{t("eli5-label") || "Explain to me"}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-base leading-relaxed text-foreground">{text}</div>
      </DialogContent>
    </Dialog>
  )
}
