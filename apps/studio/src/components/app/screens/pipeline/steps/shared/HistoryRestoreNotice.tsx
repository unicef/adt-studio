import type { ReactNode } from "react"
import { History } from "lucide-react"
import type { VersionedStep } from "@/components/pipeline/components/VersionPicker"
import type { VersionDiffDescriptor } from "@/components/pipeline/components/VersionCompareDialog"
import { StepVersionPicker } from "./StepVersionPicker"

export function HistoryRestoreNotice({
  label,
  step,
  message,
  version,
  historyVersion,
  diff,
}: {
  label: string
  step: VersionedStep
  message: ReactNode
  version: number | null
  historyVersion: number | null
  diff: VersionDiffDescriptor
}) {
  if (version == null && historyVersion == null) return null
  return (
    <section className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <History className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-foreground">{message}</p>
      <StepVersionPicker
        label={label}
        step={step}
        currentVersion={version}
        historyVersion={historyVersion}
        currentVersionInactive={version == null}
        triggerClassName="bg-muted text-foreground hover:bg-muted/80"
        diff={diff}
      />
    </section>
  )
}
