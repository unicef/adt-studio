import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScreenId } from "./screens"
import { SCREEN_TITLE } from "./words"

type Props = { screens: ScreenId[]; at: ScreenId | null; done: ScreenId[] }

/**
 * Where you are in Check, under the stepper's Check: one small bar per screen (passed, on view,
 * still to come). Shown on every width; the list beside the screen is for wide ones only.
 */
export function CheckBars({ screens, at, done }: Props) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {screens.map((s) => (
        <span key={s} className={cn("h-1 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none", s === at ? "w-4 bg-[var(--gd-step)]" : done.includes(s) ? "w-2.5 bg-[var(--gd-step)]/60" : "w-2.5 bg-border")} />
      ))}
    </span>
  )
}

/**
 * The screens of Check as a list (wide screens): the ones passed ticked with what was chosen (a
 * tap opens them again), the one on view highlighted, the ones to come greyed.
 */
export function CheckRail({ screens, at, done, values, onGo }: Props & { values: Record<ScreenId, string>; onGo: (screen: ScreenId) => void }) {
  const { t, i18n } = useLingui()
  return (
    <nav aria-label={t`Check, screen by screen`} className="hidden lg:block">
      <ol className="sticky top-6 flex flex-col gap-1">
        {screens.map((s, i) => {
          const current = s === at
          const passed = done.includes(s) && !current
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onGo(s)}
                disabled={!passed}
                style={current ? { viewTransitionName: "gd-rail-now" } : undefined}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left lg:px-3 lg:py-2.5 transition-colors duration-200 disabled:cursor-default",
                  current && "bg-[var(--lc-bubble)] shadow-[var(--lc-shadow)]",
                  passed && "hover:bg-[var(--lc-bubble)]",
                  !current && !passed && "text-muted-foreground/70",
                )}
              >
                <span
                  className={cn(
                    "mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
                    passed ? "bg-[var(--gd-step)] text-primary-foreground" : current ? "text-[var(--gd-step-ink)] shadow-[inset_0_0_0_1.5px_var(--gd-step)]" : "shadow-[inset_0_0_0_1px_var(--border)]",
                  )}
                >
                  {passed ? <Check className="size-3 stroke-[3]" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-[14px] leading-tight lg:text-[15.5px]", current && "font-semibold")}>{i18n._(SCREEN_TITLE[s])}</span>
                  {passed && values[s] && <span className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground lg:text-[13.5px]">{values[s]}</span>}
                  {passed && (
                    <span className="sr-only">
                      <Trans>(done, open again)</Trans>
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
