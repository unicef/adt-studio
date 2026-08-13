import { useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, Search, HardDrive } from "lucide-react";
import { NO_DRAG_REGION } from "@/constants";
import { cn } from "@/lib/utils";
import { REDESIGN_PATHS } from "../../nav";
import {
  SETTINGS_GROUPS,
  SETTINGS_PATHS,
  activeSettingsTab,
  type SettingsGroup,
} from "./nav";
import { SidebarLogo } from "../../SidebarLogo";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SettingsSidebar() {
  const { t, i18n } = useLingui();
  const { pathname } = useLocation();
  const activeKey = activeSettingsTab(pathname).key;
  const [query, setQuery] = useState("");

  const groups = useMemo<SettingsGroup[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((group) => {
      const groupMatches = i18n._(group.label).toLowerCase().includes(term);
      return {
        ...group,
        tabs: groupMatches
          ? group.tabs
          : group.tabs.filter((tab) =>
              i18n._(tab.label).toLowerCase().includes(term),
            ),
      };
    }).filter((group) => group.tabs.length > 0);
  }, [query, i18n]);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-3 pt-4">
        <SidebarLogo />
      </div>

      <div style={NO_DRAG_REGION} className="flex flex-col gap-2 px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t`Search settings…`}
            aria-label={t`Search settings`}
            className="h-9 w-full rounded-[10px] border bg-card pl-9 pr-3 text-[13px] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--brand-50)] [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <nav className="flex flex-1 flex-col gap-5 overflow-hidden p-3">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                {i18n._(group.label)}
              </div>
              {group.tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeKey === tab.key;
                return (
                  <Link
                    key={tab.key}
                    to={SETTINGS_PATHS[tab.key]}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                      active
                        ? "bg-card font-semibold text-brand-700 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.05)]"
                        : "text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                    )}
                  >
                    <Icon className="size-[17px]" />
                    <span className="flex-1 truncate text-left">
                      {i18n._(tab.label)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}

          {groups.length === 0 && (
            <p className="px-2.5 pt-1 text-[12.5px] leading-normal text-muted-foreground">
              <Trans>No settings match your search.</Trans>
            </p>
          )}
        </nav>
      </ScrollArea>

      <div className="flex flex-col gap-0.5 border-t p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px]">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <HardDrive className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1 leading-[1.15]">
            <div className="truncate text-[12.5px] font-semibold">
              <Trans>Local account</Trans>
            </div>
            <div className="text-[10.5px] text-muted-foreground">
              <Trans>This computer</Trans>
            </div>
          </div>
        </div>

        <Link
          to={REDESIGN_PATHS.home}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ArrowLeft className="size-[17px]" />
          <span className="flex-1 text-left">
            <Trans>Back to home</Trans>
          </span>
        </Link>
      </div>
    </aside>
  );
}
