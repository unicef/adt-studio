import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { ChevronDown, ListOrdered, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface QuizJumpEntry {
  key: string
  position: number
  question: string
  pages: string
  pageNumbers: readonly number[]
  removed: boolean
}

export function matchJumpEntry(entry: QuizJumpEntry, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase().replace(/^q\s*/, "")
  if (!needle) return true
  if (/^\d+$/.test(needle)) return String(entry.position) === needle || entry.pageNumbers.includes(Number(needle))
  return entry.question.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

export function QuizJumpMenu({
  entries,
  currentKey,
  hex,
  onJump,
}: {
  entries: QuizJumpEntry[]
  currentKey: string | null
  hex: string
  onJump: (key: string) => void
}) {
  const { t } = useLingui()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const current = entries.find((entry) => entry.key === currentKey) ?? null
  const shown = useMemo(() => entries.filter((entry) => matchJumpEntry(entry, query)), [entries, query])
  const active = Math.min(highlight, Math.max(0, shown.length - 1))

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setQuery("")
    setHighlight(Math.max(0, entries.findIndex((entry) => entry.key === currentKey)))
  }

  const move = (index: number) => {
    setHighlight(index)
    listRef.current?.querySelector<HTMLElement>(`[data-jump-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }

  const pick = (entry: QuizJumpEntry | undefined) => {
    if (!entry) return
    setOpen(false)
    onJump(entry.key)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = shown.length - 1
    if (event.key === "ArrowDown") move(Math.min(last, active + 1))
    else if (event.key === "ArrowUp") move(Math.max(0, active - 1))
    else if (event.key === "Home") move(0)
    else if (event.key === "End") move(Math.max(0, last))
    else if (event.key === "Enter") pick(shown[active])
    else return
    event.preventDefault()
  }

  if (entries.length === 0) return null

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={current ? t`Question ${current.position} in view. Go to another question` : t`Go to question`}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-[10px] border bg-background pr-2 pl-2.5 text-[12px] font-medium text-foreground transition-[background-color,border-color,box-shadow] duration-150",
            "hover:bg-muted/60 data-[state=open]:border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
            "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_35%,transparent)]",
          )}
        >
          <ListOrdered aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="min-w-[7.5rem] text-left tabular-nums">{current ? t`Question ${current.position}` : t`Go to question`}</span>
          <ChevronDown aria-hidden className={cn("size-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-xl p-0 shadow-lg">
        <div className="relative border-b p-2">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${shown[active].key}` : undefined}
            aria-label={t`Find a question by number, words or page`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t`Number, words or page…`}
            className="h-9 w-full rounded-lg bg-muted/50 pr-3 pl-8 text-[12.5px] transition-colors duration-150 placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--chrome-hex)_30%,transparent)]"
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label={t`Questions`} className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]">
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              <Trans>No question matches “{query.trim()}”</Trans>
            </p>
          ) : (
            shown.map((entry, index) => {
              const isCurrent = entry.key === currentKey
              return (
                <div
                  key={entry.key}
                  id={`${listId}-${entry.key}`}
                  role="option"
                  aria-selected={index === active}
                  data-jump-index={index}
                  onMouseMove={() => index !== active && setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(entry)}
                  className={cn(
                    "relative flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors duration-100",
                    index === active ? "bg-muted" : "bg-transparent",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r transition-opacity duration-150", isCurrent ? "opacity-100" : "opacity-0")}
                    style={{ background: hex }}
                  />
                  <span className="mt-px w-7 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{t`Q${entry.position}`}</span>
                  <span className={cn("line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug", entry.removed ? "text-muted-foreground line-through" : "text-foreground")}>
                    {entry.question || t`Untitled question`}
                  </span>
                  {entry.pages && <span className="mt-px shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{t`p. ${entry.pages}`}</span>}
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
