import { Trans } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import type { EngineRun } from "../../engine/useEngineRun"
import { Chip } from "./bubbles"
import { ScanPages } from "./ScanPages"
import { useIsWizard } from "./WizardPose"

/** The assistant's line while the engine reads, and a way out when it's slow. */
export function ReadingMessage({ run, rec, onManual }: { run: EngineRun; rec: SetupRecommendation | null; onManual: () => void }) {
  const slow = run.status === "running" && run.slow
  return (
    <div className="flex flex-col gap-2.5">
      <p>{rec ? <Trans>Done reading.</Trans> : slow ? <Trans>This is taking longer than usual. I&apos;ll keep at it.</Trans> : <Trans>I&apos;m reading some pages to suggest the best settings. This takes a few seconds.</Trans>}</p>
      {slow && (
        <div>
          <Chip onClick={onManual}>
            <Trans>Set it up myself</Trans>
          </Chip>
        </div>
      )}
    </div>
  )
}

/**
 * Where the PDF was dropped, the PDF being read: the drop zone turns into this card (same place,
 * same view-transition name), with the book's own pages being scanned, its name and page count.
 * Before the page count is known it says it's opening the file.
 */
export function ReadingCard({ file, pageCount }: { file: File | null; pageCount: number }) {
  const wizard = useIsWizard()
  return (
    <div className="gd-reading flex w-full flex-col items-center gap-5 rounded-[22px] border-2 border-[var(--gd-step)] bg-[var(--lc-bubble)] px-6 py-10 text-center lg:py-[clamp(40px,calc(var(--gd-vh,1vh)*7),84px)]" style={{ viewTransitionName: "gd-drop" }}>
      {file && pageCount > 0 ? (
        <span className="flex items-center">
          {/* The wizard points its wand at the pages: its scan beam ends over the first one. */}
          {wizard && <img src="/add-book/wizard-scan.png" alt="" aria-hidden draggable={false} className="relative z-10 -mr-14 h-[150px] w-auto shrink-0 object-contain" />}
          <ScanPages file={file} pageCount={pageCount} />
        </span>
      ) : <span className="grid size-16 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]"><FileText className="size-7" /></span>}
      <span className="flex max-w-full flex-col items-center gap-1">
        <span className="max-w-full truncate text-[17px] font-semibold lg:text-[19px]">{file?.name}</span>
        <span className="text-[14px] text-muted-foreground lg:text-[15px]">{pageCount > 0 ? <Trans>{pageCount} pages · reading</Trans> : <Trans>Opening the PDF…</Trans>}</span>
      </span>
      <span aria-hidden className="gd-reading-bar h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-muted">
        <span />
      </span>
    </div>
  )
}
