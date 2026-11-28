import type { CSSProperties } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Pencil } from "lucide-react"
import type { SetupBookFactId, SetupDecided, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { NameField } from "../nameField"
import type { ScreenId } from "../screens"
import { screenTitle } from "../words"
import { useSummaryDetails } from "./summaryDetails"

/**
 * Screen 5 · Name and create: the choices in short (each with Edit, which opens its screen and
 * comes back here) with a line on what each means for the book, then the book's name. On wide
 * screens the choices sit in two columns, so the screen still fits the window. Create and "Set it
 * up myself" are the screen's buttons.
 */
export function NameScreen({ rec, facts, screens, values, settings, pageCount, onEdit }: { rec: SetupRecommendation; facts: SetupBookFactId[]; screens: ScreenId[]; values: Record<ScreenId, string>; settings: SetupDecided; pageCount: number; onEdit: (screen: ScreenId) => void }) {
  const { i18n, t } = useLingui()
  const details = useSummaryDetails(rec, settings, facts, pageCount)
  const shown = screens.filter((s) => s !== "name")
  // Two columns from lg, filled top to bottom: the first half of the screens, then the rest.
  const rows = Math.ceil(shown.length / 2)
  return (
    <div className="flex flex-col gap-4">
      <ul style={{ "--rows": rows } as CSSProperties} className="lc-surface grid px-4 py-1 sm:px-5 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-[repeat(var(--rows),auto)] lg:gap-x-10 lg:px-6">
        {shown.map((s, i) => {
          const title = i18n._(screenTitle(s, facts))
          const detail = details[s]
          return (
            <li key={s} className={cn("relative flex items-start gap-3 border-border/70 py-2.5 lg:block [@media(max-height:800px)]:py-1.5", i > 0 && "border-t", i % rows === 0 ? "lg:border-t-0" : "lg:border-t")}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:gap-3 lg:flex-col lg:gap-0.5">
                <span className="shrink-0 text-[13px] text-muted-foreground sm:w-[150px] sm:pt-0.5 lg:w-auto lg:pt-0 lg:pr-20">{title}</span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14.5px] font-medium lg:pr-16 lg:text-[16px]">{values[s]}</span>
                  {detail && <span className="text-[12.5px] leading-snug text-muted-foreground">{detail}</span>}
                </div>
              </div>
              <button type="button" onClick={() => onEdit(s)} aria-label={t`Edit ${title}`} className="lc-link -mr-2 -mt-1.5 inline-flex lg:absolute lg:right-0 lg:top-0.5 lg:mt-0 lg:[@media(max-height:800px)]:top-0 min-h-9 shrink-0 items-center gap-1 px-2.5 text-[13.5px] font-medium">
                <Pencil aria-hidden className="size-3.5" />
                <Trans>Edit</Trans>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="lc-surface p-4 sm:px-5 [@media(max-height:800px)]:py-3">
        <NameField />
      </div>
    </div>
  )
}
