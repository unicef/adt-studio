import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Home, Settings, Download } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useSettingsDialog } from "@/routes/__root";
import { useUpdateDialog } from "@/components/updates";
import { usePlatform } from "@/hooks/use-platform";
import { useAppVersion } from "@/hooks/use-app-version";
import { useWindowControls } from "@/hooks/use-window-controls";
import { DRAG_REGION, NO_DRAG_REGION } from "@/constants";
import {
  LinuxControls,
  MacOSTrafficLightSpacer,
  WindowsControls,
} from "@/components/title-bar";
import { cn } from "@/lib/utils";

export type StudioTopBarProps = {
  /** When true, the brand row links to `/` with hover styles (e.g. add-book flow). */
  brandLinksHome?: boolean;
  /** Optional title after `/` (e.g. translated “Add Book”). */
  trailingTitle?: ReactNode;
};

export function StudioTopBar({
  brandLinksHome = false,
  trailingTitle,
}: StudioTopBarProps) {
  const { t } = useLingui();
  const { openSettings } = useSettingsDialog();
  const { openUpdateDialog, hasPendingUpdate } = useUpdateDialog();
  const platform = usePlatform();
  const version = useAppVersion();
  const { available: hasWindowControls } = useWindowControls();

  const showWindowsControls = hasWindowControls && platform === "windows";
  const showLinuxControls = hasWindowControls && platform === "linux";
  const showMacOSSpacer = hasWindowControls && platform === "macos";

  const brandInner = (
    <>
      <Home className="w-4 h-4 shrink-0" />
      <span className="text-sm font-semibold">ADT Studio</span>
      {version && (
        <span className="text-[10px] font-normal tabular-nums text-white/50">
          v{version}
        </span>
      )}
    </>
  );

  const brandRow = brandLinksHome ? (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-2.5 hover:bg-gray-600 px-2 h-10 transition-colors no-drag",
        !showMacOSSpacer && "-ml-2",
      )}
      style={NO_DRAG_REGION}
      title={t`Back to books`}
    >
      {brandInner}
    </Link>
  ) : (
    <div className="flex items-center gap-2.5">{brandInner}</div>
  );

  return (
    <header
      className={cn(
        "shrink-0 h-10 flex items-center bg-gray-700 text-white select-none",
        !hasWindowControls && "py-1",
      )}
      style={DRAG_REGION}
    >
      {showMacOSSpacer && <MacOSTrafficLightSpacer />}
      <div className="flex items-center min-w-0 px-4">
        {brandRow}
        {trailingTitle != null && (
          <>
            <span className="text-white/40 text-sm mx-2">/</span>
            <span className="text-sm font-semibold">{trailingTitle}</span>
          </>
        )}
      </div>
      <nav
        aria-label={t`Studio actions`}
        className="ml-auto flex items-center gap-1.5 pr-2 no-drag"
        style={NO_DRAG_REGION}
      >
        <LocaleSwitcher />
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 shrink-0 text-white/70 hover:text-white hover:bg-gray-600"
          onClick={openUpdateDialog}
          aria-label={hasPendingUpdate ? t`Update available` : t`Software update`}
          title={hasPendingUpdate ? t`Update available` : t`Software update`}
        >
          <Download className="h-3.5 w-3.5" />
          {hasPendingUpdate && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-blue-400"
            />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-white/70 hover:text-white hover:bg-gray-600"
          onClick={() => openSettings()}
          aria-label={t`Settings`}
          title={t`Settings`}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </nav>
      {showLinuxControls && <LinuxControls className="self-stretch pr-3" />}
      {showWindowsControls && (
        <WindowsControls className="self-stretch" variant="dark" />
      )}
    </header>
  );
}
