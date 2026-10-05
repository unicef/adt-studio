import { NO_DRAG_REGION } from "@/constants";
import { SidebarLogo } from "../../SidebarLogo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsSearch } from "./useSettingsSearch";
import { SettingsSearchBar } from "./SettingsSearchBar";
import {
  SETTINGS_RESULTS_ID,
  SettingsResultsList,
  settingsResultId,
} from "./SettingsResultsList";
import { SettingsNavList } from "./SettingsNavList";
import { SettingsRailFooter } from "./SettingsRailFooter";

export function SettingsSidebar() {
  const {
    inputRef,
    query,
    setQuery,
    results,
    hasQuery,
    activeIndex,
    setActiveIndex,
    handleInputKeyDown,
  } = useSettingsSearch({ clearOnSelect: true });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-3">
        <SidebarLogo />
      </div>

      <div style={NO_DRAG_REGION} className="flex flex-col gap-2 px-3 pb-3">
        <SettingsSearchBar
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          onKeyDown={handleInputKeyDown}
          resultsId={hasQuery ? SETTINGS_RESULTS_ID : undefined}
          activeResultId={results[activeIndex] ? settingsResultId(results[activeIndex].id) : undefined}
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
            <SettingsNavList />
          )}
        </div>
      </ScrollArea>

      <SettingsRailFooter />
    </aside>
  );
}
