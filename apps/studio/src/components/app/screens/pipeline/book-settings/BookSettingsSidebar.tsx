import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft } from "lucide-react"
import { DRAG_REGION, NO_DRAG_REGION } from "@/constants"
import { usePlatform } from "@/hooks/use-platform"
import { useWindowControls } from "@/hooks/use-window-controls"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BookCover } from "@/components/app/BookCover"
import { deriveCover } from "@/components/app/data"
import { SettingsSearchBar } from "@/components/app/screens/settings/SettingsSearchBar"
import {
  SETTINGS_RESULTS_ID,
  SettingsResultsList,
  settingsResultId,
} from "@/components/app/screens/settings/SettingsResultsList"
import type { BookDetail } from "@/api/client"
import { BookSettingsNavList } from "./BookSettingsNavList"
import { useBookSettingsSearch } from "./useBookSettingsSearch"

export interface BookSettingsSidebarProps {
  book: BookDetail | undefined
  label: string
  section: string
  onSelectSection: (section: string) => void
  onBack: () => void
}

export function BookSettingsSidebar({
  book,
  label,
  section,
  onSelectSection,
  onBack,
}: BookSettingsSidebarProps) {
  const { t } = useLingui()
  const {
    inputRef,
    query,
    setQuery,
    results,
    hasQuery,
    activeIndex,
    setActiveIndex,
    handleInputKeyDown,
  } = useBookSettingsSearch(onSelectSection)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <BookSettingsIdentity book={book} label={label} />

      <div style={NO_DRAG_REGION} className="flex flex-col gap-2 px-3 pb-3">
        <SettingsSearchBar
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          onKeyDown={handleInputKeyDown}
          placeholder={t`Search book settings…`}
          resultsId={hasQuery ? SETTINGS_RESULTS_ID : undefined}
          activeResultId={
            results[activeIndex] ? settingsResultId(results[activeIndex].id) : undefined
          }
          expanded={hasQuery}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div style={NO_DRAG_REGION} className="p-3">
          {hasQuery ? (
            <SettingsResultsList
              results={results}
              activeIndex={activeIndex}
              onActiveChange={setActiveIndex}
              onRun={(result) => result.onSelect()}
              query={query}
              layout="rail"
            />
          ) : (
            <BookSettingsNavList section={section} onSelect={onSelectSection} />
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <button
          type="button"
          onClick={onBack}
          style={NO_DRAG_REGION}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ArrowLeft className="size-[17px]" />
          <span className="flex-1 text-left">
            <Trans>Back to storyboard</Trans>
          </span>
        </button>
      </div>
    </aside>
  )
}

function BookSettingsIdentity({ book, label }: { book: BookDetail | undefined; label: string }) {
  const platform = usePlatform()
  const { available } = useWindowControls()
  const macChrome = platform === "macos" && available
  const title = book?.metadata?.title ?? book?.title ?? label
  const authors = book
    ? (book.metadata?.authors?.length ? book.metadata.authors : book.authors).join(", ")
    : ""

  return (
    <div className="shrink-0 px-3">
      {macChrome && <div style={DRAG_REGION} className="h-[38px] w-full" aria-hidden />}

      <div
        style={DRAG_REGION}
        className={`flex items-center gap-2.5 px-1.5 pb-4 ${macChrome ? "pt-1" : "pt-4"}`}
      >
        <div className="h-11 w-8 shrink-0 overflow-hidden rounded-[5px] shadow-sm">
          {book ? (
            <BookCover title={title} author={authors} cover={deriveCover(book)} fit="cover" />
          ) : (
            <div className="size-full bg-muted" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px leading-[1.15]">
          <b className="truncate text-[13.5px]">{title}</b>
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Trans>Settings</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}
