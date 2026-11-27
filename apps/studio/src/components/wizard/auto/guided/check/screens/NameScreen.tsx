import { Trans, useLingui } from "@lingui/react/macro"
import { Pencil } from "lucide-react"
import type { SetupDecided } from "@adt/types"
import { NameField } from "../nameField"
import type { ScreenId } from "../screens"
import type { SetupBookFactId } from "@adt/types"
import { screenTitle } from "../words"

/**
 * Screen 5 · Name and create: the choices in short (each with Edit, which opens its screen and
 * comes back here), then the book's name. Create and "Set it up myself" are the screen's buttons.
 */
export function NameScreen({ facts, screens, values, settings, onEdit }: { facts: SetupBookFactId[]; screens: ScreenId[]; values: Record<ScreenId, string>; settings: SetupDecided; onEdit: (screen: ScreenId) => void }) {
  const { i18n, t } = useLingui()
  return (
    <div className="flex flex-col gap-4">
      <ul className="lc-surface flex flex-col divide-y divide-border/70 px-4 py-1 sm:px-5">
        {screens
          .filter((s) => s !== "name")
          .map((s) => {
            const title = i18n._(screenTitle(s, facts))
            return (
              <li key={s} className="flex items-center gap-3 py-2 lg:py-2.5 [@media(max-height:800px)]:py-1.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="shrink-0 text-[13px] text-muted-foreground sm:w-[150px] lg:w-[190px] lg:text-[14.5px]">{title}</span>
                  <span className="min-w-0 text-[14.5px] font-medium lg:text-[16px]">{values[s]}</span>
                </span>
                <button type="button" onClick={() => onEdit(s)} aria-label={t`Edit ${title}`} className="lc-link inline-flex min-h-9 shrink-0 items-center gap-1 px-2.5 text-[13.5px] font-medium">
                  <Pencil aria-hidden className="size-3.5" />
                  <Trans>Edit</Trans>
                </button>
              </li>
            )
          })}
      </ul>
      <div className="lc-surface p-4 sm:px-5">
        <NameField />
      </div>
    </div>
  )
}
