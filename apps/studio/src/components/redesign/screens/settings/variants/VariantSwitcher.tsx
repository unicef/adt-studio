import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import {
  setSettingsNavVariant,
  useSettingsNavVariant,
  type SettingsNavVariant,
} from "../useSettingsNavVariant"

const OPTIONS: SettingsNavVariant[] = ["A", "B", "C"]

export function VariantSwitcher() {
  const variant = useSettingsNavVariant()

  return (
    <div
      style={NO_DRAG_REGION}
      className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-full border bg-card/90 px-1.5 py-1 text-[11px] font-semibold shadow-lg backdrop-blur transition-opacity hover:opacity-100"
    >
      <span className="px-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        nav
      </span>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setSettingsNavVariant(option)}
          className={cn(
            "grid size-6 place-items-center rounded-full transition-colors",
            variant === option
              ? "bg-brand-600 text-white"
              : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
