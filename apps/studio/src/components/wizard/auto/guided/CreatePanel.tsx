import { Trans } from "@lingui/react/macro"
import { CreateFailed } from "./shared/Create"
import { RingCreate } from "./shared/RingCreate"
import { WizardPose } from "./shared/WizardPose"
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
            <strong className="font-semibold">Done.</strong> “{name}” is set up. I&apos;ve started making its first pages; open the book to follow along.
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is set up. Start the conversion from the book page.
          </Trans>
        )}
      </p>
    )
  return (
    <p>
      {run.status === "saving" ? <Trans>Setting up “{name}”. This takes a moment.</Trans> : <Trans>Saved. Now I&apos;m starting on the first pages.</Trans>}
    </p>
  )
}

/** Under the Create bubble: a progress ring that becomes the Open button once the book is ready. */
export function CreatePanel({ run }: { run: CreateRun }) {
  if (run.status === "failed") return null
  return (
    <div className="lc-surface flex items-center gap-6 p-5">
      <WizardPose pose={run.status === "done" ? "celebrate" : "thinking"} size={120} />
      <div className="min-w-0 flex-1">
        <RingCreate run={run} />
      </div>
    </div>
  )
}
