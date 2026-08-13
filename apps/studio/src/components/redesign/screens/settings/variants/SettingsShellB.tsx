import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { TopBar } from "@/components/title-bar/TopBar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { NO_DRAG_REGION } from "@/constants"
import { useSettingsSearch } from "../useSettingsSearch"
import { SettingsRailB } from "./SettingsRailB"
import { SettingsSearchBar } from "./SettingsSearchBar"
import { SettingsResultsList } from "./SettingsResultsList"
import { SettingsContent } from "./SettingsContent"

export function SettingsShellB({ fullWidth }: { fullWidth: boolean }) {
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
  } = useSettingsSearch({ clearOnSelect: true })

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <SettingsRailB />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar className="absolute inset-x-0 top-0 z-[3] drag-region" />

        <div
          style={NO_DRAG_REGION}
          className="shrink-0 border-b bg-background px-[34px] pb-4 pt-14"
        >
          <SettingsSearchBar
            inputRef={inputRef}
            value={query}
            onChange={setQuery}
            onKeyDown={handleInputKeyDown}
            size="lg"
            placeholder={t`Search all settings…`}
          />
        </div>

        {hasQuery ? (
          <ScrollArea className="flex min-h-0 flex-1 flex-col">
            <ScrollBar className="z-10" />
            <div className="mx-auto w-full max-w-[720px] px-[34px] pb-14 pt-6">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <Trans>Results</Trans>
              </div>
              <SettingsResultsList
                results={results}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                onRun={(result) => result.onSelect()}
                query={query}
                layout="pane"
              />
            </div>
          </ScrollArea>
        ) : (
          <SettingsContent fullWidth={fullWidth} />
        )}
      </div>
    </div>
  )
}
