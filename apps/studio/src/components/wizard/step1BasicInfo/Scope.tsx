import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import { BookOpen, Scissors, SlidersHorizontal } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { PageRange } from "./PageRange"

export function Scope() {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)

  return (
    <fieldset className="flex flex-col gap-3">
      <legend id="scope-legend" className="mb-1 text-sm font-medium text-foreground">
        <Trans>How much of this book do you want to process?</Trans>
      </legend>
      <div
        role="radiogroup"
        aria-labelledby="scope-legend"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <ScopeCard
          selected={scope === "whole"}
          onSelect={() => form.setFieldValue("scope", "whole")}
          icon={<BookOpen className="h-4 w-4" />}
          title={<Trans>Whole book</Trans>}
          description={<Trans>Process every page on this machine.</Trans>}
        />
        <ScopeCard
          selected={scope === "range"}
          onSelect={() => form.setFieldValue("scope", "range")}
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title={<Trans>Page range</Trans>}
          description={<Trans>Process only a range of pages here.</Trans>}
        />
        <ScopeCard
          selected={scope === "split"}
          onSelect={() => form.setFieldValue("scope", "split")}
          icon={<Scissors className="h-4 w-4" />}
          title={<Trans>Split into parts</Trans>}
          description={<Trans>Hand out page-range parts and merge them back later.</Trans>}
        />
      </div>

      {scope === "range" && <PageRange />}

      {scope === "split" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <Trans>
            Extraction is skipped now. After the book is created, use the Split &
            merge panel on its overview to export page-range parts and merge the
            completed results back.
          </Trans>
        </p>
      )}
    </fieldset>
  )
}

function ScopeCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {title}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
    </button>
  )
}
