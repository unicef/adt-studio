import { Trans } from "@lingui/react/macro"
import { CreateFailed } from "./shared/Create"
import { RingCreate } from "./shared/RingCreate"
import { useIsWizard, WizardPose } from "./shared/WizardPose"
import type { CreateRun } from "./shared/useCreateRun"

/** The Create step's bubble: what's happening, then that it's done (or why it isn't). */
export function CreateSays({ run, onRetry, onRename }: { run: CreateRun; onRetry: () => void; onRename: () => void }) {
  const name = run.name
  if (run.status === "failed") return <CreateFailed run={run} current onRetry={onRetry} onRename={onRename} />
  if (run.status === "done")
    return (
      <p>
        {run.extract && !run.warning ? (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is saved, and its first pages are on their way.
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is saved with its setup.
          </Trans>
        )}
      </p>
    )
  return (
    <p>
      {run.status === "saving" ? <Trans>Creating “{name}”. This takes a moment.</Trans> : <Trans>Saved. Now I&apos;m starting on the first pages.</Trans>}
    </p>
  )
}

/** Under the Create bubble: a progress ring that becomes the Open button once the book is ready. */
export function CreatePanel({ run }: { run: CreateRun }) {
  const wizard = useIsWizard()
  if (run.status === "failed") return null
  return (
    <div className="lc-surface flex items-center gap-6 p-5">
      {wizard && <WizardPose pose={run.status === "done" ? "celebrate" : "thinking"} size={120} />}
      <div className="min-w-0 flex-1">
        <RingCreate run={run} />
      </div>
    </div>
  )
}
