import { Trans } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { ErrorDetails } from "../../errors/ErrorState"
import { Chip } from "./bubbles"
import type { CreateRun } from "./useCreateRun"

/** The filled button: flat (no glow), in the app's brand blue. */
export const LC_PRIMARY = "rounded-[12px] shadow-none hover:shadow-none"

/** Creating failed: nothing was saved. A taken name goes back to the name; anything else can be tried again. */
export function CreateFailed({ run, current, onRetry, onRename }: { run: CreateRun; current: boolean; onRetry: () => void; onRename: () => void }) {
  const taken = run.failure?.kind === "taken"
  return (
    <div className="flex flex-col gap-2">
      <p>
        {taken ? (
          <Trans>
            <strong className="font-semibold">Another book is already called {run.name}.</strong> <span className="text-muted-foreground">Choose a new name and set it up again.</span>
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">I couldn&apos;t set up the book.</strong> <span className="text-muted-foreground">Nothing was saved and your choices are kept.</span>
          </Trans>
        )}
      </p>
      {current && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {taken ? (
            <Chip primary onClick={onRename}>
              <Trans>Choose a new name</Trans>
            </Chip>
          ) : (
            <Chip primary onClick={onRetry} icon={<RotateCcw className="size-4" />}>
              <Trans>Try again</Trans>
            </Chip>
          )}
        </div>
      )}
      {!taken && run.failure && <ErrorDetails detail={run.failure.detail} className="items-start [&>button]:-ml-2" />}
    </div>
  )
}
