import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ChevronDown, Layers, Library, Settings, SlidersHorizontal, Terminal } from "lucide-react"
import { BookCover } from "@/components/app/BookCover"
import { Kbd, MOD_KEY } from "@/components/app/ui/Kbd"
import { deriveCover } from "@/components/app/data"
import { APP_PATHS } from "@/components/app/nav"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NO_DRAG_REGION } from "@/constants"
import { useBooks } from "@/hooks/use-books"
import { cn } from "@/lib/utils"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { usePipelineDebug } from "@/components/app/screens/pipeline/debug/debugDock"
import { useBarSettings } from "../PipelineChrome"

const itemClassName =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"

export function BookMenu({ label }: { label: string }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const nav = usePipelineNavigation(label)
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const book = books?.find((candidate) => candidate.label === label)
  const title = book?.title || label
  const screenSettings = useBarSettings()
  const debug = usePipelineDebug()
  const inMenu = screenSettings && screenSettings.label !== t`Storyboard settings`

  const pick = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={NO_DRAG_REGION}
          title={title}
          aria-label={t`Book menu: ${title}`}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg py-1 pl-1.5 pr-1 transition-colors duration-150 hover:bg-muted",
            open && "bg-muted",
          )}
        >
          {book && (
            <span className="h-6 w-[18px] shrink-0 overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgb(0_0_0/0.2)] [&>div]:rounded-[3px] [&>div]:border-0">
              <BookCover title={title} author={book.authors.join(", ")} cover={deriveCover(book)} fit="cover" />
            </span>
          )}
          <span className="min-w-0 max-w-[min(36vw,560px)] truncate text-[13px] font-semibold">{title}</span>
          <ChevronDown
            aria-hidden
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div className="flex gap-2.5 border-b px-2 pb-2.5 pt-1.5">
          {book && (
            <span className="h-11 w-8 shrink-0 overflow-hidden rounded-[4px] shadow-[0_1px_3px_rgb(0_0_0/0.2)] [&>div]:rounded-[4px] [&>div]:border-0">
              <BookCover title={title} author={book.authors.join(", ")} cover={deriveCover(book)} fit="cover" />
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold leading-snug">{title}</span>
            {book && (
              <span className="text-[12px] text-muted-foreground">
                {plural(book.pageCount, { one: "# page", other: "# pages" })}
                {book.languageCode ? ` · ${book.languageCode}` : ""}
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-col pt-1">
          {inMenu && screenSettings && (
            <>
              <button type="button" className={cn(itemClassName, "font-medium")} onClick={pick(screenSettings.onOpen)}>
                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                {screenSettings.label}
              </button>
              <div className="my-1 h-px bg-border" />
            </>
          )}
          <button type="button" className={itemClassName} onClick={pick(nav.openBookInfo)}>
            <Settings className="size-3.5 text-muted-foreground" />
            <Trans>Book settings</Trans>
          </button>
          <button type="button" className={itemClassName} onClick={pick(() => nav.openStepSettings("storyboard"))}>
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <Trans>Storyboard settings</Trans>
          </button>
          <button type="button" className={itemClassName} onClick={pick(() => nav.openStep("extract"))}>
            <Layers className="size-3.5 text-muted-foreground" />
            <Trans>Setup (Extract, Sectioning)</Trans>
          </button>
          {debug && (
            <button type="button" className={itemClassName} onClick={pick(debug.open)}>
              <Terminal className="size-3.5 text-muted-foreground" />
              <Trans>Debug panel</Trans>
              <Kbd keys={[MOD_KEY, "⇧", "D"]} className="ml-auto" />
            </button>
          )}
          <div className="my-1 h-px bg-border" />
          <button type="button" className={itemClassName} onClick={pick(() => void navigate({ to: APP_PATHS.library }))}>
            <Library className="size-3.5 text-muted-foreground" />
            <Trans>Back to the library</Trans>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
