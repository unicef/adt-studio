import { useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import {
  setSettingsLayoutVariant,
  useSettingsLayoutVariant,
  type SettingsLayoutVariant,
} from "../useSettingsLayoutVariant"
import { setSettingsTabsVariant, useSettingsTabsVariant } from "../useSettingsTabsVariant"
import type { SettingsTabsVariant } from "../nav"

const LAYOUT_OPTIONS: { value: SettingsLayoutVariant; label: MessageDescriptor }[] = [
  { value: "cards", label: msg`Cards` },
  { value: "dense", label: msg`Dense` },
  { value: "sections", label: msg`Sections` },
]

const TABS_OPTIONS: { value: SettingsTabsVariant; label: MessageDescriptor }[] = [
  { value: "grouped", label: msg`Grouped` },
  { value: "flat", label: msg`Flat` },
  { value: "regrouped", label: msg`Regrouped` },
]

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: MessageDescriptor
  options: { value: T; label: MessageDescriptor }[]
  value: T
  onChange: (value: T) => void
}) {
  const { i18n } = useLingui()
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {i18n._(label)}
      </span>
      <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              value === option.value
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {i18n._(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsDevSwitcher() {
  const layout = useSettingsLayoutVariant()
  const tabs = useSettingsTabsVariant()

  return (
    <div
      style={NO_DRAG_REGION}
      className="fixed bottom-3 right-3 z-50 flex flex-col gap-1.5 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur"
    >
      <Segmented label={msg`Layout`} options={LAYOUT_OPTIONS} value={layout} onChange={setSettingsLayoutVariant} />
      <Segmented label={msg`Tabs`} options={TABS_OPTIONS} value={tabs} onChange={setSettingsTabsVariant} />
    </div>
  )
}
