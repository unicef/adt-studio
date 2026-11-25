import { Trans } from "@lingui/react/macro"
import { ENDS_IN_PLACE } from "./shared/ideas/finish/context"
import { CreateFailed, CreateSteps, Ready } from "./shared/Create"
import type { CreateRun } from "./shared/useCreateRun"
import { useGuidedIdea } from "./ideas"

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

/**
 * Under the Create bubble: the progress, then the end, as the finish idea draws them. f26 (ring →
 * button) and f29 (steps fold) end in place; the others swap to the ready card once it's done.
 */
export function CreatePanel({ run, onOpen }: { run: CreateRun; onOpen: (label: string) => void }) {
  const finish = useGuidedIdea("finish")
  if (run.status === "failed") return null
  if (run.status === "done" && !ENDS_IN_PLACE.includes(finish)) return <Ready run={run} onOpen={() => run.label && onOpen(run.label)} />
  return (
    <div className="lc-surface p-5">
      <CreateSteps run={run} />
    </div>
  )
}
