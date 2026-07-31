import { useAtom } from "jotai";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { Slider } from "@/shared/ui/slider";
import { audioVolumeAtom } from "@/features/audio/state/audio.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { cn } from "@/shared/lib/utils";

/**
 * Volume picker for the play bar. Trigger pill mirrors `SpeedMenu`. Popover
 * houses the shadcn Slider for volume control plus a mute toggle button.
 */
export function VolumeMenu() {
  const [volume, setVolume] = useAtom(audioVolumeAtom);
  const { t } = useTranslation();

  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const label = t("read-aloud-volume-label") || "Volume";
  const percent = Math.round(volume * 100);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "size-10 flex rounded-lg items-center justify-center",
          "text-foreground hover:bg-accent hover:text-accent-foreground",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        )}
        aria-label={`${label}: ${percent}%`}
      >
        <Icon className="w-4 h-4" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        positionMethod="fixed"
        className={cn(
          "p-2 px-3 border-0",
          "bg-popover/95 text-popover-foreground backdrop-blur-md",
          "shadow-lg ring-1 ring-border",
          "flex flex-row items-center gap-2",
        )}
      >
        <button
          type="button"
          onClick={() => setVolume(volume === 0 ? 1 : 0)}
          aria-label={
            volume === 0
              ? t("unmute-label") || "Unmute"
              : t("mute-label") || "Mute"
          }
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
            "text-foreground hover:bg-accent hover:text-accent-foreground",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Icon className="w-4 h-4" />
        </button>

        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[volume]}
          onValueChange={(values) =>
            setVolume(Array.isArray(values) ? values[0] : values)
          }
          aria-label={label}
          orientation="horizontal"
        />

        <span className="text-xs font-medium text-muted-foreground tabular-nums w-9 text-right">
          {percent}%
        </span>
      </PopoverContent>
    </Popover>
  );
}
