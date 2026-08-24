import { Trans, useLingui } from "@lingui/react/macro"
import { Check, FileText, Link2, Loader2, Package, UploadCloud, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { PublishStepId, PublishStepStatus } from "@adt/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PUBLISH_STEP_COPY } from "@/components/pipeline/stages/publish/publish-steps"
import { PublishErrorNotice } from "@/components/pipeline/stages/publish/PublishErrorNotice"
import { formatElapsed } from "@/components/settings/publishing/provision-elapsed"
import type { BookPublishRunController } from "@/hooks/use-book-publication"

const STEP_ICONS: Record<PublishStepId, LucideIcon> = {
  export: FileText,
  package: Package,
  upload: UploadCloud,
  register: Link2,
}

function StepRow({
  step,
  state,
  isLast,
}: {
  step: (typeof PUBLISH_STEP_COPY)[number]
  state: PublishStepStatus
  isLast: boolean
}) {
  const { i18n } = useLingui()
  const Icon = STEP_ICONS[step.id]
  const running = state === "running"

  return (
    <li className="flex gap-3">
      {/* The rail, not a row of ticks: four steps in sequence are a journey, and a line joining
          them says which way it runs without a word of explanation. */}
      <span className="flex w-8 shrink-0 flex-col items-center" aria-hidden="true">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300 motion-reduce:transition-none",
            state === "done"
              ? "bg-emerald-500 text-white"
              : state === "error"
                ? "bg-destructive text-white"
                : running
                  ? "bg-indigo-600 text-white"
                  : "border border-border bg-card text-muted-foreground/60",
          )}
        >
          {state === "done" ? (
            <Check
              className="size-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300"
              aria-hidden="true"
            />
          ) : state === "error" ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Icon className="size-4" aria-hidden="true" />
          )}
        </span>
        {isLast ? null : (
          <span
            className={cn(
              "w-px flex-1 transition-colors duration-500 motion-reduce:transition-none",
              state === "done" ? "bg-emerald-300" : "bg-border",
            )}
          />
        )}
      </span>

      <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", isLast ? "pb-0" : "pb-5")}>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm transition-colors duration-300 motion-reduce:transition-none",
              running
                ? "font-semibold text-foreground"
                : state === "pending"
                  ? "text-muted-foreground/70"
                  : "font-medium text-foreground",
            )}
          >
            {i18n._(step.title)}
          </span>
          {running ? (
            <Loader2
              className="size-3.5 animate-spin text-indigo-500 motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
        </span>

        {/* The detail is only worth the space for the step that is happening; on the others it
            would be four paragraphs of instructions for a machine doing the work itself. */}
        <span
          className={cn(
            "grid overflow-hidden text-xs leading-5 text-muted-foreground transition-all duration-300 motion-reduce:transition-none",
            running ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <span className="min-h-0">{i18n._(step.detail)}</span>
        </span>
      </span>
    </li>
  )
}

interface PublishingUpdateTakeoverProps {
  title: string
  fromVersion: number | null
  run: BookPublishRunController
  elapsedMs: number
}

/**
 * The update, given the whole page.
 *
 * Publishing is the one thing on this screen that takes minutes rather than milliseconds, and it
 * used to happen in a card the size of a paragraph while the dashboard sat around it pretending
 * nothing was going on. Now the dashboard steps aside: the four steps are all on screen at once,
 * in order, with a rail between them, and the one that is running says what it is doing.
 *
 * All four are visible rather than one-at-a-time on purpose. "Uploading" alone tells an author
 * nothing about how much is left, and this is exactly the wait where somebody starts wondering
 * whether it has hung — the same reason the provisioning flow lists its eight.
 */
export function PublishingUpdateTakeover({
  title,
  fromVersion,
  run,
  elapsedMs,
}: PublishingUpdateTakeoverProps) {
  const failed = run.status === "error"
  const settled = run.stepStates.filter((state) => state === "done").length
  const total = PUBLISH_STEP_COPY.length

  return (
    <div
      data-testid="publish-update-takeover"
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-2xl border p-8",
        failed
          ? "border-destructive/30 bg-destructive/[0.03]"
          : "border-indigo-200/70 bg-gradient-to-b from-indigo-50/70 via-card to-card",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-500",
      )}
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span
          role="status"
          aria-live="polite"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          {failed ? <Trans>Publishing stopped</Trans> : <Trans>Updating the shared copy</Trans>}
        </span>
        <span className="max-w-md text-sm leading-6 text-muted-foreground">
          {failed ? (
            <Trans>Nothing changed for your readers — they are still reading the copy you had.</Trans>
          ) : fromVersion === null ? (
            <Trans>{title} — your readers keep reading until this finishes.</Trans>
          ) : (
            <Trans>
              {title} — readers stay on version {fromVersion} until this finishes.
            </Trans>
          )}
        </span>
      </div>

      <ol className="flex w-full max-w-sm list-none flex-col p-0">
        {PUBLISH_STEP_COPY.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            state={run.stepStates[index] ?? "pending"}
            isLast={index === PUBLISH_STEP_COPY.length - 1}
          />
        ))}
      </ol>

      <div className="flex w-full max-w-sm flex-col gap-1.5">
        <span className="h-1 overflow-hidden rounded-full bg-zinc-100">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
              failed ? "bg-destructive" : "bg-indigo-600",
            )}
            style={{ width: `${(settled / total) * 100}%` }}
          />
        </span>
        <span className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <Trans>
            {settled} of {total}
          </Trans>
          <span>{formatElapsed(elapsedMs)}</span>
        </span>
      </div>

      {failed && run.failure ? (
        <div className="flex w-full max-w-md flex-col gap-3">
          <PublishErrorNotice failure={run.failure} />
          <Button className="self-center" onClick={run.update}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
