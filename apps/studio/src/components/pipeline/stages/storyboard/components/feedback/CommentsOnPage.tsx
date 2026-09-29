import { useState, type RefObject } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { ChevronDown, FileText, MapPinOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar } from "./CommentThread"
import { CommentCard } from "./CommentCard"
import { PinLayer } from "./PinLayer"
import { SectionNotes } from "./SectionNotes"
import { isPlaced, type SectionComments } from "./use-section-comments"

/**
 * The Storyboard's comments, on the page. Nothing but the page: pins where readers left them, and the open comment as a
 * card beside its pin. Comments with no place on the page wait in a small tray at the top left,
 * which opens them in the same card.
 */
export function CommentsOnPage({
  comments,
  containerRef,
  onNavigateSection,
}: {
  comments: SectionComments
  containerRef: RefObject<HTMLElement | null>
  onNavigateSection?: (index: number) => void
}) {
  const [trayOpen, setTrayOpen] = useState(false)
  const loose = comments.ordered.filter((pin) => !isPlaced(pin))
  const selected = comments.selected
  const looseSelected = selected !== null && !isPlaced(selected) && selected.reason !== "measuring"

  return (
    <>
      <PinLayer comments={comments} containerRef={containerRef} />
      {selected && isPlaced(selected) ? <CommentCard pin={selected} comments={comments} containerRef={containerRef} /> : null}

      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="pointer-events-none sticky top-2 flex flex-col items-start gap-2 p-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            {loose.length > 0 ? (
              <button
                type="button"
                aria-expanded={trayOpen}
                onClick={() => setTrayOpen((open) => !open)}
                className="flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
              >
                <MapPinOff className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <Plural value={loose.length} one="# comment without a pin" other="# comments without a pin" />
                <ChevronDown className={cn("size-3 transition-transform duration-150 motion-reduce:transition-none", trayOpen && "rotate-180")} aria-hidden="true" />
              </button>
            ) : null}
            <SectionNotes comments={comments} onNavigateSection={onNavigateSection} />
          </div>

          {trayOpen && loose.length > 0 ? (
            <ul className="pointer-events-auto flex w-72 list-none flex-col gap-0.5 rounded-xl border bg-popover p-1 shadow-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
              {loose.map((pin) => (
                <li key={pin.thread.root.id}>
                  <button
                    type="button"
                    onClick={() => {
                      comments.select(pin.thread.root.id)
                      setTrayOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                      pin.thread.root.id === selected?.thread.root.id && "bg-brand-50 dark:bg-brand-500/10",
                    )}
                  >
                    <Avatar name={pin.thread.root.author_name} color={pin.thread.root.author_color} small />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="truncate font-semibold text-foreground">{pin.thread.root.author_name}</span>
                        {!isPlaced(pin) && pin.reason === "page-level" ? (
                          <>
                            <FileText className="size-3 shrink-0" aria-hidden="true" />
                            <Trans>Whole page</Trans>
                          </>
                        ) : (
                          <>
                            <MapPinOff className="size-3 shrink-0" aria-hidden="true" />
                            <Trans>Spot gone</Trans>
                          </>
                        )}
                      </span>
                      <span className="line-clamp-2 text-xs leading-4 text-foreground/85">{pin.thread.root.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {looseSelected ? (
            <div className="pointer-events-auto">
              <CommentCard pin={selected} comments={comments} containerRef={containerRef} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
