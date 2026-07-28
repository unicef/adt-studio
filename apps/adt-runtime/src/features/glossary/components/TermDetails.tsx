import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft, Loader2, Locate } from "lucide-react"
import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import { SignLanguageVideo } from "@/features/glossary/components/SignLanguageVideo"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { dockMenuValueAtom, selectedGlossaryTermAtom } from "@/shared/state/ui.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { DockContent } from "@/features/dock/components/DockLayout"
import {
  findPageWithGlossaryTerm,
  isGlossaryTermOnPage,
  locateGlossaryTerm,
} from "@/features/glossary/lib/locate"


export function TermDetails() {
  const { t } = useTranslation()
  const data = useAtomValue(glossaryDataAtom)
  const [selected, setSelected] = useAtom(selectedGlossaryTermAtom)
  const setDockMenuValue = useSetAtom(dockMenuValueAtom)
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const [locating, setLocating] = useState(false)
  const [playingVideo, setPlayingVideo] = useState(false)

  if (!selected) return null
  const entry = data[selected]
  if (!entry) return null

  const handleLocate = async () => {
    if (locating) return

    if (isGlossaryTermOnPage(entry)) {
      setDockMenuValue("")
      setSelected(null)
      requestAnimationFrame(() => locateGlossaryTerm(entry))
      return
    }

    setLocating(true)
    const otherPages = pages.filter((p) => p.section_id !== currentSectionId)
    const target = await findPageWithGlossaryTerm(entry, otherPages).catch(
      () => null,
    )
    if (!target) {
      setLocating(false)
      return
    }
    window.location.href = `${target.href}#glossary=${encodeURIComponent(entry.word)}`
  }

  return (
    <DockContent
      className="flex flex-col gap-4 p-4"
      role="region"
      aria-label={t("glossary-term-details") || "Glossary term details"}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSelected(null)}
        className="self-start -ml-2 text-muted-foreground"
      >
        <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
        {t("glossary-label") || "Glossary"}
      </Button>

      <div className="flex items-start gap-3">
        {entry.emoji ? (
          <span
            className="text-3xl shrink-0"
            role="img"
            aria-label={`Symbol for ${entry.word}`}
          >
            {entry.emoji}
          </span>
        ) : null}
        <h4 className="flex-1 min-w-0 text-2xl font-bold leading-tight break-words">
          {entry.word}
        </h4>
        {entry.image && (
          <img
            src={entry.image}
            alt=""
            draggable={false}
            className="h-20 w-20 shrink-0 rounded-lg bg-muted object-contain p-1"
          />
        )}
      </div>

      <p className="text-base leading-relaxed">{entry.definition}</p>

      {entry.video && (
        <div>
          <button
            type="button"
            aria-expanded={playingVideo}
            onClick={() => setPlayingVideo((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <i className="fa fa-sign-language text-sm leading-none" aria-hidden="true" />
            {t("sign-language-label") || "Sign language"}
          </button>
          {playingVideo && (
            <SignLanguageVideo
              src={entry.video}
              className="mt-2 w-full max-w-xs rounded-lg bg-black"
            />
          )}
        </div>
      )}

      {entry.variations && entry.variations.length > 0 ? (
        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-1">
            {t("glossary-variations-label") || "Variations"}
          </p>
          <p className="italic">{entry.variations.join(", ")}</p>
        </div>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        onClick={handleLocate}
        disabled={locating}
        className="self-start"
      >
        {locating ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <Locate className="w-4 h-4 mr-1.5" />
        )}
        {locating
          ? t("glossary-locating") || "Locating…"
          : t("glossary-locate-on-page") || "Show on page"}
      </Button>
    </DockContent>
  )
}
