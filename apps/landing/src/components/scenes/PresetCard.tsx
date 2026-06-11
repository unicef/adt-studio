import { Trans, useLingui } from "@lingui/react/macro";
import { Info, Settings } from "lucide-react";
import type { Preset } from "@/data/presets";
import { cn } from "@/lib/cn";

export function PresetCard({
  preset,
  selected,
}: {
  preset: Preset;
  selected: boolean;
}) {
  const { i18n } = useLingui();
  const { Icon } = preset;
  return (
    <div
      className={cn(
        "block w-full rounded-lg p-1 text-left transition-all",
        "border border-[#e5e5e5]",
      )}
      style={
        selected
          ? {
              boxShadow: `0 0 0 2px ${preset.accentBg}`,
              transition: "box-shadow 0.3s ease",
            }
          : { transition: "box-shadow 0.3s ease" }
      }
    >
      <div
        className={cn(
          "flex h-[200px] w-full items-center justify-center overflow-hidden rounded",
          preset.bgColor,
        )}
      >
        <Icon
          className={cn("size-24", preset.iconColor)}
          strokeWidth={1.4}
          aria-hidden
        />
      </div>
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
        <span className="text-sm font-bold text-black leading-5">
          {i18n._(preset.title)}
        </span>
        <span className="line-clamp-3 text-[10px] leading-[14px] text-[#737373]">
          {i18n._(preset.description)}
        </span>
        <div
          className="mt-1 flex items-center justify-between"
          style={{ visibility: preset.id === "custom" ? "hidden" : "visible" }}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#2b7fff]">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <Trans>See examples</Trans>
          </span>
          <span className="flex items-center gap-1 rounded-full border border-[#e5e5e5] px-2 py-0.5">
            <Settings className="h-3.5 w-3.5 text-[#0a0a0a]" />
            <span className="text-xs font-semibold leading-4 text-[#0a0a0a]">
              6
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
