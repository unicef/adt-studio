import { Trans } from "@lingui/react/macro"
import { ArrowLeft } from "lucide-react"
import type { SetupFailure } from "../../../recommendation/client"
import { Book3D } from "../../../../core/Book3D"
import { SetupError } from "../../../errors/SetupError"

/** The reading stopped: the book closes (greyed) and the error says why, with Try again and the manual setup. */
export function Failure({ cover, failure, onRetry, onManual, onBack }: { cover?: string; failure: SetupFailure; onRetry: () => void; onManual: () => void; onBack: () => void }) {
  return (
    <div className="m-auto flex w-full max-w-[680px] flex-col items-center gap-8 py-10 text-center">
      <div className="grayscale transition-[filter] duration-500 animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
        <Book3D src={cover} height={200} maxWidth={220} />
      </div>
      <SetupError kind={failure.kind} detail={failure.detail} onRetry={onRetry} onManual={onManual} />
      <button type="button" onClick={onBack} className="-mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft aria-hidden className="size-3.5" />
        <Trans>Back to the cover</Trans>
      </button>
    </div>
  )
}
