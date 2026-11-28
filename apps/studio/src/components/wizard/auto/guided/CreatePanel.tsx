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
        {/* Why the conversion did or didn't start: it starts here unless the book is split or no AI provider is set up. */}
        {run.extract && !run.warning ? (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is set up. I&apos;ve started making its first pages; open the book to follow along.
          </Trans>
        ) : run.warning ? (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is set up, but I couldn&apos;t start the conversion. Start it from the book page.
          </Trans>
        ) : run.split ? (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is set up and split into parts. Open it to share the parts; each person converts their own pages.
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">Done.</strong> “{name}” is set up. Set up an AI provider in Settings, then start the conversion from the book page.
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
