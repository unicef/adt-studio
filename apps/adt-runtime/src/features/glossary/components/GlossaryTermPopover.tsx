/**
 * Floating popover that appears when the user clicks a highlighted glossary
 * term inside `#content`. Listens via a delegated click handler at the
 * document level — the highlighted spans are mutated DOM (not React-rendered)
 * so we can't attach onClick directly.
 *
 * Positioning uses Radix Popover's `virtualRef` API: a synthetic anchor
 * whose `getBoundingClientRect()` returns the clicked element's box, so
 * Radix's collision detection / repositioning logic works without forcing
 * the highlighter to render React.
 */
import { useAtomValue, useSetAtom } from "jotai"
import { BookOpen } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Popover, PopoverContent } from "@/shared/ui/popover"
import { Button } from "@/shared/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import { SignLanguageVideo } from "@/features/glossary/components/SignLanguageVideo"
import {
  dockMenuValueAtom,
  glossaryModeAtom,
  selectedGlossaryTermAtom,
} from "@/shared/state/ui.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"

interface VirtualAnchor {
  getBoundingClientRect: () => DOMRect
}

const FALLBACK_RECT: DOMRect = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => "",
}

export function GlossaryTermPopover() {
  const { t } = useTranslation()
  const data = useAtomValue(glossaryDataAtom)
  const enabled = useAtomValue(glossaryModeAtom) as boolean
  const setDockMenuValue = useSetAtom(dockMenuValueAtom)
  const setSelected = useSetAtom(selectedGlossaryTermAtom)

  // The currently-shown term + the rect to anchor against. Local state so
  // the popover only opens on click, not on every change to the selected
  // term atom (the sidebar's list also writes to that).
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const anchorRectRef = useRef<DOMRect | null>(null)

  // Bumped on each click + each scroll/resize while open, to force Radix
  // to re-read `getBoundingClientRect`.
  const [, setRectTick] = useState(0)
  const refreshAnchor = useCallback(() => setRectTick((n) => n + 1), [])

  const virtualRef = useRef<VirtualAnchor>({
    getBoundingClientRect: () => anchorRectRef.current ?? FALLBACK_RECT,
  })

  const open = activeKey !== null

  const closePopover = useCallback(() => {
    setActiveKey(null)
    anchorRectRef.current = null
  }, [])

  // Delegated click on highlighted spans. Only active while highlighting is
  // on — when off, the spans don't exist anyway.
  useEffect(() => {
    if (!enabled) return
    const handler = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const span = target.closest<HTMLElement>(".glossary-term[data-glossary-key]")
      if (!span) return
      event.preventDefault()
      const key = span.getAttribute("data-glossary-key")
      if (!key || !data[key]) return
      anchorRectRef.current = span.getBoundingClientRect()
      setActiveKey(key)
      refreshAnchor()
    }
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [enabled, data, refreshAnchor])

  // Keep the popover anchored to its term as the page scrolls/resizes.
  useEffect(() => {
    if (!open || !activeKey) return
    const update = () => {
      const span = document.querySelector<HTMLElement>(
        `.glossary-term[data-glossary-key="${CSS.escape(activeKey)}"]`,
      )
      if (!span) {
        closePopover()
        return
      }
      anchorRectRef.current = span.getBoundingClientRect()
      refreshAnchor()
    }
    document.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      document.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, activeKey, closePopover, refreshAnchor])

  const entry = activeKey ? data[activeKey] : null

  const handleViewInGlossary = () => {
    if (!entry) return
    setSelected(entry.word)
    setDockMenuValue("glossary")
    closePopover()
  }

  return (
    <Popover open={open} onOpenChange={(o) => !o && closePopover()}>
      {entry ? (
        <PopoverContent
          side="top"
          align="center"
          anchor={() => virtualRef.current}
          className="w-80"
          role="dialog"
          aria-label={`Definition for ${entry.word}`}
        >
          {(() => {
            // The picture sits top-right, in line with the word and
            // definition — unless the headword is long enough that it would
            // get squeezed against the image (~16 chars fills the remaining
            // column at text-lg in the w-80 popover); then the picture drops
            // below the text at full reading width.
            const imageBelowText = Boolean(entry.image) && entry.word.length > 16
            return (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 flex flex-col items-start gap-3">
                    {entry.emoji ? (
                      <span className="text-3xl shrink-0" aria-hidden>
                        {entry.emoji}
                      </span>
                    ) : null}
                    <div className="min-w-0">
                      <h4 className="font-bold text-lg leading-tight break-words">
                        {entry.word}
                      </h4>
                      <p className="text-sm leading-relaxed mt-1 text-foreground/80">
                        {entry.definition}
                      </p>
                    </div>
                  </div>
                  {entry.image && !imageBelowText && (
                    <img
                      src={entry.image}
                      alt=""
                      draggable={false}
                      className="h-24 w-24 shrink-0 rounded-lg bg-muted object-contain p-1"
                    />
                  )}
                </div>
                {entry.image && imageBelowText && (
                  <img
                    src={entry.image}
                    alt=""
                    draggable={false}
                    className="mt-3 h-24 w-24 rounded-lg bg-muted object-contain p-1"
                  />
                )}
                {entry.video && (
                  <SignLanguageVideo
                    src={entry.video}
                    className="mt-3 w-full aspect-video rounded-lg bg-black object-contain"
                  />
                )}
              </>
            )
          })()}
          <div className="mt-3 pt-3 border-t border-border flex justify-end">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewInGlossary}
                    title={t("glossary-view-term") || "View in glossary"}
                    className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:border-blue-400 dark:hover:bg-blue-950/40"
                  >
                    <BookOpen className="w-4 h-4 mr-1" aria-hidden="true" />
                    {t("glossary-view-term") || "View in glossary"}
                  </Button>
                }
              />
              <TooltipContent>
                {t("glossary-view-term") || "View in glossary"}
              </TooltipContent>
            </Tooltip>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  )
}
