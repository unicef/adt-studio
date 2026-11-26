import { useEffect, useRef, useState, type ReactNode } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { AlertTriangle, BookOpen, Check, ChevronDown, Loader2, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ErrorDetails } from "../../errors/ErrorState"
import { PrimaryButton } from "../../../core/ui"
import { Chip } from "./bubbles"
import type { CreateRun } from "./useCreateRun"

export const NAME_INPUT = "wizard-project-name"

/** The filled button: the board's flat button (no glow), in the app's brand blue. */
export const LC_PRIMARY = "rounded-[12px] shadow-none hover:shadow-none"

/** Creating failed: nothing was saved. A taken name goes back to the name; anything else can be tried again. */
export function CreateFailed({ run, current, onRetry, onRename }: { run: CreateRun; current: boolean; onRetry: () => void; onRename: () => void }) {
  const taken = run.failure?.kind === "taken"
  return (
    <div className="flex flex-col gap-2">
      <p>
        {taken ? (
          <Trans>
            <strong className="font-semibold">Another book is already called {run.name}.</strong> <span className="text-muted-foreground">Choose a new name above and create it again.</span>
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">I couldn&apos;t create the book.</strong> <span className="text-muted-foreground">Nothing was saved and your setup is kept.</span>
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
