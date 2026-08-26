import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Search, House, BookMarked, Split, Settings, Plus, Upload, CornerDownLeft, BookOpen, type LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { BookSummary } from "@/api/client"
import { toBookVM, type CoverSpec } from "./data"
import { BookCover } from "./BookCover"
import { Kbd } from "./ui/Kbd"
import { APP_PATHS } from "./nav"
import { rankBySearch, searchTokens } from "./search"
import { useOpenBook } from "./use-open-book"
import { SETTINGS_PATHS } from "./screens/settings/nav"
import {
  SETTINGS_SEARCH_ENTRIES,
  SETTINGS_SECTION_ENTRIES,
  buildSettingsSearchItems,
} from "./screens/settings/searchIndex"

const LISTBOX_ID = "app-palette-results"
const optionId = (itemId: string) => `${LISTBOX_ID}-${itemId}`

interface PaletteItem {
  id: string
  title: string
  sub?: string
  keywords?: string
  icon?: LucideIcon
  cover?: CoverSpec
  author?: string
  run: () => void
}
interface PaletteGroup {
  label: string
  items: PaletteItem[]
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  books: BookSummary[]
  locale: string
  onOpenAdd: () => void
}

export function CommandPalette({ open, onClose, books, locale, onOpenAdd }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12%] max-w-[600px] translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden"
      >
        <DialogTitle className="sr-only">
          <Trans>Command palette</Trans>
        </DialogTitle>
        <PaletteResults onClose={onClose} books={books} locale={locale} onOpenAdd={onOpenAdd} />
        <div className="flex items-center gap-4 border-t bg-muted px-4 py-2.5 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Kbd keys={["↑", "↓"]} />
            <Trans>navigate</Trans>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd keys={["↵"]} />
            <Trans>open</Trans>
          </span>
          <span className="ml-auto font-mono text-[11px]">
            <Trans>⌘K to toggle</Trans>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type PaletteResultsProps = Omit<CommandPaletteProps, "open">

function PaletteResults({ onClose, books, locale, onOpenAdd }: PaletteResultsProps) {
  const navigate = useNavigate()
  const openBook = useOpenBook()
  const { t, i18n } = useLingui()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const groups = useMemo<PaletteGroup[]>(() => {
    const tokens = searchTokens(query)
    const nav: PaletteItem[] = [
      { id: "nav-home", title: t`Home`, icon: House, run: () => navigate({ to: APP_PATHS.home }) },
      { id: "nav-library", title: t`Library`, icon: BookMarked, run: () => navigate({ to: APP_PATHS.library }) },
      { id: "nav-handoffs", title: t`Split & merge`, icon: Split, run: () => navigate({ to: APP_PATHS.handoffs }) },
      { id: "nav-settings", title: t`Settings`, icon: Settings, run: () => navigate({ to: APP_PATHS.settings }) },
    ]
    const actions: PaletteItem[] = [
      { id: "act-add", title: t`Add a book`, sub: t`Convert a PDF or import a project`, icon: Plus, run: onOpenAdd },
      { id: "act-import", title: t`Import a project`, sub: t`.zip → added as-is`, icon: Upload, run: () => navigate({ to: "/books/import" }) },
    ]
    const bookItems: PaletteItem[] = books.map((b) => {
      const vm = toBookVM(b, locale)
      return {
        id: `book-${b.label}`,
        title: vm.displayTitle,
        sub: `${vm.authors} · ${vm.pagesText}`,
        cover: vm.cover,
        author: vm.authors,
        run: () => openBook(b.label),
      }
    })
    const settingsItems: PaletteItem[] = buildSettingsSearchItems(
      i18n,
      tokens.length > 0 ? SETTINGS_SEARCH_ENTRIES : SETTINGS_SECTION_ENTRIES,
    ).map((it) => ({
      id: it.id,
      title: it.title,
      sub: it.sub,
      keywords: it.keywords,
      icon: it.icon,
      run: () => navigate({ to: SETTINGS_PATHS[it.section], hash: it.anchor }),
    }))

    const rank = (items: PaletteItem[]) =>
      rankBySearch(items, tokens, (it) => ({
        title: it.title,
        extra: `${it.sub ?? ""} ${it.keywords ?? ""}`,
      }))

    return [
      { label: t`Navigation`, items: rank(nav) },
      { label: t`Books`, items: rank(bookItems) },
      { label: t`Settings`, items: rank(settingsItems) },
      { label: t`Actions`, items: rank(actions) },
    ].filter((g) => g.items.length > 0)
  }, [query, books, locale, onOpenAdd, navigate, openBook, t, i18n])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const activeId = flat[active]?.id

  useEffect(() => {
    if (active >= flat.length) setActive(flat.length > 0 ? flat.length - 1 : 0)
  }, [flat.length, active])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [activeId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((i) => Math.min(flat.length - 1, i + 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = flat[active]
        if (item) {
          item.run()
          onClose()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [flat, active, onClose])

  let runningIndex = -1

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3.5">
        <Search className="size-[18px] text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={LISTBOX_ID}
          aria-activedescendant={flat[active] ? optionId(flat[active].id) : undefined}
          placeholder={t`Search books, actions and settings…`}
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <Kbd keys={[t`Esc`]} />
      </div>

      <ScrollArea viewportClassName="max-h-[46vh]">
        <div id={LISTBOX_ID} role="listbox" aria-label={t`Results`} className="p-2">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="px-3 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {g.label}
              </div>
              {g.items.map((it) => {
                runningIndex += 1
                const idx = runningIndex
                const isActive = idx === active
                const Icon = it.icon
                return (
                  <div
                    key={it.id}
                    id={optionId(it.id)}
                    ref={isActive ? activeRef : undefined}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      it.run()
                      onClose()
                    }}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5",
                      isActive && "bg-muted",
                    )}
                  >
                    {it.cover ? (
                      <span className="block h-8 w-6 shrink-0 overflow-hidden rounded-sm shadow-sm">
                        <BookCover title={it.title} author={it.author ?? ""} cover={it.cover} />
                      </span>
                    ) : (
                      <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-brand-50 text-brand-600">
                        {Icon ? <Icon className="size-4" /> : <BookOpen className="size-4" />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium text-foreground">{it.title}</div>
                      {it.sub && <div className="truncate text-xs text-muted-foreground">{it.sub}</div>}
                    </div>
                    {isActive && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {flat.length === 0 && (
          <div className="px-5 py-9 text-center text-[13px] text-muted-foreground">
            <Trans>No results for “{query}”</Trans>
          </div>
        )}
      </ScrollArea>
    </>
  )
}
