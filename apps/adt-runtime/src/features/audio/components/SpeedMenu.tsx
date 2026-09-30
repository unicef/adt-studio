import { useAtom } from "jotai"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { cn } from "@/shared/lib/utils"
import { audioSpeedAtom } from "@/features/audio/state/audio.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"

const SPEEDS = [
  { value: 0.5, labelKey: "read-aloud-speed-slow", fallback: "Slow" },
  { value: 1, labelKey: "read-aloud-speed-normal", fallback: "Normal" },
  { value: 1.5, labelKey: "read-aloud-speed-fast", fallback: "Fast" },
  { value: 2, labelKey: "read-aloud-speed-very-fast", fallback: "Very fast" },
] as const

/**
 * Speed picker for the play bar. Replaces the legacy `#read-aloud-settings`
 * menu. Renders as a pill trigger inside the play bar capsule.
 */
export function SpeedMenu() {
  const [speed, setSpeed] = useAtom(audioSpeedAtom)
  const { t } = useTranslation()

  const active = SPEEDS.find((s) => s.value === speed) ?? SPEEDS[1]
  const activeLabel = t(active.labelKey) || active.fallback

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          "min-w-30 h-10 px-3 rounded-lg",
          "flex items-center gap-1",
          "text-xs font-medium text-foreground",
          "hover:bg-accent hover:text-accent-foreground",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        )}
        aria-label={`${t("read-aloud-speed-label") || "Playback speed"}: ${activeLabel}`}
      >
        <span className="flex-1 text-start">{activeLabel}</span>
        <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} positionMethod="fixed" className="min-w-[8rem]">
        <DropdownMenuRadioGroup
          value={String(speed)}
          onValueChange={(v) => setSpeed(parseFloat(v))}
        >
          {SPEEDS.map((s) => (
            <DropdownMenuRadioItem key={s.value} value={String(s.value)}>
              {t(s.labelKey) || s.fallback}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
