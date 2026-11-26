import { useLingui } from "@lingui/react/macro"
import type { SetupDecided, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { SETTING_IDS } from "../../engine/ids"
import { WIZARD_SETTING, wizardValue } from "./wizardNames"

/**
 * The settings a choice applies, in the wizard's own names ("Render Strategy: Dynamic Overlay"),
 * shown when "Wizard names" is on. `only` limits it to some settings; `changed` marks the ones that
 * differ from another choice.
 */
export function WizardSettings({ settings, only, changed, className }: { settings: SetupDecided; only?: SetupSettingId[]; changed?: SetupSettingId[]; className?: string }) {
  const { i18n } = useLingui()
  const name = (v: ReturnType<typeof wizardValue>) => (typeof v === "string" ? v : i18n._(v))
  const ids = only ?? SETTING_IDS
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {ids.map((id) => (
        <span
          key={id}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11.5px] leading-tight ring-1",
            changed?.includes(id) ? "bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30" : "bg-muted/60 text-muted-foreground ring-border",
          )}
        >
          <span className="opacity-70">{i18n._(WIZARD_SETTING[id])}:</span>
          <span className="font-semibold">{name(wizardValue(id, settings[id]?.value))}</span>
        </span>
      ))}
    </span>
  )
}
