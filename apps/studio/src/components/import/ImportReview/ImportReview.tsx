import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Loader2, Puzzle, Upload } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import { ErrorDetails } from "@/components/import/ImportProject/ErrorDetails"
import type { FriendlyError } from "@/hooks/use-archive-error"
import { cn } from "@/lib/utils"
import { CopyTextButton } from "./CopyTextButton"
import { HeroBand, archiveKind } from "./HeroBand"
import { ActivityBanner } from "./ActivityBanner"
import { RepairView } from "./RepairView"
import { CheckList, FactList, FeaturesSummary, Panel, ReadinessList, StatusRow } from "./ReviewParts"
import { previewCover, previewTitle } from "./helpers"
import { useReviewModel } from "./use-review-model"

export type ImportState = "idle" | "importing" | "failed"

/**
 * The review step: a band with the book and its numbers, then equal-height
 * columns for status and checks, features, and what import will do. A repair
 * replaces the columns with the problems and how to fix them.
 */
export function ImportReview({
  preview,
  file,
  unresolvedActivityCount,
  decidedSectionIds,
  onReviewActivities,
  validationError,
  rawValidationError,
  importState,
  importError,
  rawImportError,
  onReplace,
}: {
  preview: AnyImportPreview
  file: File
  unresolvedActivityCount: number
  /** Activity pages already given a type in the dialog. */
  decidedSectionIds: ReadonlySet<string>
  onReviewActivities: () => void
  validationError: FriendlyError | null
  rawValidationError: string | null
  importState: ImportState
  importError: FriendlyError | null
  rawImportError: string | null
  onReplace: () => void
}) {
  const { t } = useLingui()
  const model = useReviewModel(preview, unresolvedActivityCount, validationError)
  const title = previewTitle(preview)
  const importing = importState === "importing"
  const adt = isAdtBundleImportPreview(preview) ? preview : null
  const undecided = adt?.activityReview?.items.filter((item) => (
    item.status === "needs-review" && !decidedSectionIds.has(item.sectionId)
  )) ?? []

  const banner = importing ? (
    <div role="status" className="flex shrink-0 flex-col gap-2.5 rounded-xl bg-brand-500/10 px-4 py-3.5">
      <p className="flex items-center gap-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        <Trans>Creating {title}…</Trans>
      </p>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-brand-500/15">
        <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary motion-safe:animate-indeterminate" />
      </div>
      <p className="text-xs text-muted-foreground"><Trans>Large books can take a minute. Keep this window open.</Trans></p>
    </div>
  ) : importState === "failed" && importError ? (
    <StatusRow status={{ tone: "red", icon: AlertCircle, title: t`The import didn’t finish`, text: importError.hint }}>
      {rawImportError ? <ErrorDetails message={rawImportError} className="mt-2 items-start" /> : null}
    </StatusRow>
  ) : null

  let columns
  if (model.mode === "repair" && adt?.agentGuide && model.status) {
    columns = <RepairView preview={adt} status={model.status} issues={model.issues} />
  } else {
    const attention = model.mode === "activity" || model.mode === "blocked"
    columns = (
      <div
        className={cn(
          "grid min-h-[320px] flex-1 gap-4 transition-opacity duration-300",
          model.mode === "blocked" ? "lg:grid-cols-2" : "lg:grid-cols-3",
          importing && "pointer-events-none opacity-55",
        )}
      >
        <Panel title={attention ? <Trans>Needs your attention</Trans> : <Trans>Status and checks</Trans>}>
          {model.mode === "activity" ? (
            <ActivityBanner
              items={undecided}
              unresolvedCount={unresolvedActivityCount}
              activityPrompt={adt?.agentGuide?.activityPrompt ?? null}
              onChooseTypes={onReviewActivities}
            />
          ) : model.status ? (
            <StatusRow status={model.status}>
              {model.mode === "blocked" ? (
                <div className="mt-2 flex flex-col items-start gap-2">
                  {rawValidationError ? <ErrorDetails message={rawValidationError} className="items-start" /> : null}
                  <Button type="button" variant="outline" size="sm" onClick={onReplace} className="h-8 text-xs">
                    <Upload className="size-3.5" />
                    <Trans>Choose another ZIP</Trans>
                  </Button>
                </div>
              ) : null}
            </StatusRow>
          ) : null}
          <CheckList checks={model.checks} />
        </Panel>
        {model.facts ? (
          <Panel title={<Trans>About this part</Trans>}><FactList facts={model.facts} /></Panel>
        ) : (
          <Panel title={<Trans>Features</Trans>}><FeaturesSummary preview={preview} /></Panel>
        )}
        {model.mode === "blocked" ? null : (
          <Panel title={<Trans>Import will</Trans>}><ReadinessList steps={model.steps} /></Panel>
        )}
      </div>
    )
  }

  return (
    <div aria-busy={importing} className="flex min-h-0 flex-1 flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <HeroBand
        kind={archiveKind(preview)}
        cover={previewCover(preview)}
        title={previewTitle(preview)}
        file={file}
        mode={model.mode}
        subtitle={model.subtitle}
        stats={model.stats}
        replaceDisabled={importing}
        onReplace={onReplace}
      />
      {banner}
      {columns}
    </div>
  )
}
