import { useId, type CSSProperties, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import { BookOpen, Scissors, SlidersHorizontal } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { getPresetAccent } from "@/components/wizard/constants"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { PageRange } from "./PageRange"

type ScopeValue = "whole" | "range" | "split"

export function Scope() {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope) as ScopeValue
  const selectedPreset = useStore(form.store, (s) => s.values.selectedPreset)
  const accent = getPresetAccent(selectedPreset)

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">
        <Trans>How much of this book do you want to process?</Trans>
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ScopeCard
          value="whole"
          selected={scope === "whole"}
          accent={accent.bg}
          onSelect={() => form.setFieldValue("scope", "whole")}
          icon={<BookOpen className="h-4 w-4" />}
          title={<Trans>Whole book</Trans>}
          description={<Trans>Process every page on this machine.</Trans>}
        />
        <ScopeCard
          value="range"
          selected={scope === "range"}
          accent={accent.bg}
          onSelect={() => form.setFieldValue("scope", "range")}
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title={<Trans>Page range</Trans>}
          description={<Trans>Process only a range of pages here.</Trans>}
        />
        <ScopeCard
          value="split"
          selected={scope === "split"}
          accent={accent.bg}
          onSelect={() => form.setFieldValue("scope", "split")}
          icon={<Scissors className="h-4 w-4" />}
          title={<Trans>Split into parts</Trans>}
          description={<Trans>Hand out page-range parts and merge them back later.</Trans>}
        />
      </div>

      <Collapsible shown={scope === "range"}>
        <div className="pt-1">
          <PageRange />
        </div>
      </Collapsible>

      <Collapsible shown={scope === "split"}>
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          <Trans>
            Extraction is skipped now. After the book is created, use the Split &
            merge panel on its overview to export page-range parts and merge the
            completed results back.
          </Trans>
        </p>
      </Collapsible>
    </fieldset>
  )
}

function ScopeCard({
  value,
  selected,
  accent,
  onSelect,
  icon,
  title,
  description,
}: {
  value: ScopeValue
  selected: boolean
  accent: string
  onSelect: () => void
  icon: ReactNode
  title: ReactNode
  description: ReactNode
}) {
  const inputId = useId()
  return (
    <label
      htmlFor={inputId}
      style={
        {
          "--accent": accent,
          ...(selected
            ? {
                borderColor: accent,
                backgroundColor: `${accent}0d`,
                boxShadow: `0 0 0 1px ${accent}4d`,
              }
            : {}),
        } as CSSProperties
      }
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left",
        "transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
        "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        !selected &&
          "border-border hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_3%,transparent)]",
      )}
    >
      <input
        id={inputId}
        type="radio"
        name="wizard-scope"
        value={value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <span style={selected ? { color: accent } : undefined}>{icon}</span>
        {title}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
    </label>
  )
}
