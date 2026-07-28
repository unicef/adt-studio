import { Check } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/**
 * Colour family for the action's icon pill. Actions in the buddy menu are
 * grouped ("Reading", "How it looks", "My things") and each group carries its
 * own hue so young readers can find a familiar action by colour + shape rather
 * than by reading every label.
 */
export type KidsActionTone = "reading" | "look" | "mine" | "quiet"

const TONE_ICON: Record<KidsActionTone, string> = {
  reading: "bg-sky-100 text-sky-700",
  look: "bg-violet-100 text-violet-700",
  mine: "bg-emerald-100 text-emerald-700",
  quiet: "bg-slate-100 text-slate-600",
}

interface KidsActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  testId?: string
  variant?: "grid" | "list"
  tone?: KidsActionTone
  /** Renders the icon without the coloured pill (for avatars/portraits). */
  iconPlain?: boolean
  /** Renders an explicit On/Off pill instead of a checkmark. */
  toggle?: boolean
  onLabel?: string
  offLabel?: string
  /** Low-emphasis treatment for secondary actions outside the main groups. */
  quiet?: boolean
  reduceMotion?: boolean
}

export function KidsActionButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  testId,
  variant = "grid",
  tone = "reading",
  iconPlain,
  toggle,
  onLabel,
  offLabel,
  quiet,
  reduceMotion = false,
}: KidsActionButtonProps) {
  const list = variant === "list"

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 w-full gap-2 rounded-2xl px-3 py-3",
        list
          ? "items-center justify-start text-left"
          : "flex-col items-center justify-center text-center",
        "text-base font-extrabold leading-tight text-slate-900",
        quiet
          ? "bg-slate-50 text-slate-700 shadow-[0_2px_0_#E2E8F0] ring-2 ring-slate-200 hover:bg-slate-100 hover:shadow-[0_3px_0_#E2E8F0] active:shadow-[0_1px_0_#E2E8F0]"
          : "bg-white shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-100 hover:bg-sky-50 hover:shadow-[0_4px_0_#D9EBF8] active:shadow-[0_1px_0_#D9EBF8]",
        reduceMotion
          ? "transition-none"
          : "transition-[transform,box-shadow,background-color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-[2px]",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:shadow-[0_3px_0_#D9EBF8] disabled:active:translate-y-0 disabled:active:shadow-[0_3px_0_#D9EBF8]",
        active &&
          "bg-[#FFF6D6] ring-2 ring-[#FFC800] shadow-[0_3px_0_#EFC94C] hover:bg-[#FFF6D6] hover:shadow-[0_4px_0_#EFC94C] active:shadow-[0_1px_0_#EFC94C]",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          !iconPlain && TONE_ICON[quiet ? "quiet" : tone],
          !iconPlain && active && "bg-[#FFE58A] text-[#8A6400]",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className={cn(list && "min-w-0 flex-1")}>{label}</span>
      {list && toggle ? (
        <span className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "relative h-8 w-14 rounded-full border-2",
              active
                ? "border-[#B8860B] bg-[#FFC800] shadow-[inset_0_-2px_0_#DDAE00]"
                : "border-slate-400 bg-slate-300 shadow-inner",
              reduceMotion
                ? "transition-none"
                : "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
            )}
          >
            <span
              className={cn(
                "absolute left-0.5 top-0.5 h-6 w-6 rounded-full border-2 bg-white shadow-md",
                active
                  ? "translate-x-6 border-[#8A6400]"
                  : "translate-x-0 border-slate-500",
                reduceMotion
                  ? "transition-none"
                  : "transition-[transform,border-color] duration-200 ease-out",
              )}
            />
          </span>
          <span
            className={cn(
              "min-w-7 text-sm font-black",
              active ? "text-[#765600]" : "text-slate-600",
            )}
          >
            {active ? onLabel : offLabel}
          </span>
        </span>
      ) : list && active ? (
        <Check className="h-6 w-6 shrink-0 text-[#B8860B]" aria-hidden="true" />
      ) : null}
    </button>
  )
}
