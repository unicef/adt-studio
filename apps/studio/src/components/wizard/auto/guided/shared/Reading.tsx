import { Trans } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import type { EngineRun } from "../../engine/useEngineRun"
import { Chip } from "./bubbles"
import { ScanPages } from "./ScanPages"

type ReadingMessageProps = { file: File; pageCount: number; run: EngineRun; rec: SetupRecommendation | null; onManual: () => void }

/** The assistant's message while the engine reads: three real pages being scanned, one sentence under them, and a way out when it's slow. */
export function ReadingMessage({ file, pageCount, run, rec, onManual }: ReadingMessageProps) {
  const slow = run.status === "running" && run.slow
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="py-1">
        <ScanPages file={file} pageCount={pageCount} />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <p>{rec ? <Trans>Done reading.</Trans> : slow ? <Trans>This is taking longer than usual. I&apos;ll keep at it.</Trans> : <Trans>Reading your book. This takes a few seconds.</Trans>}</p>
        {slow && (
          <div>
            <Chip onClick={onManual}>
              <Trans>Set it up myself</Trans>
            </Chip>
          </div>
        )}
      </div>
    </div>
  )
}
