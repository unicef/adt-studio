import { Plural, Trans } from "@lingui/react/macro"
import { Check, FileText } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import type { EngineRun } from "../../engine/useEngineRun"
import { Chip } from "./bubbles"
import { ScanPages } from "./ScanPages"

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
export function ReadingCard({ file, pageCount, done = false }: { file: File | null; pageCount: number; /** The reading is over (back here from a later step): no scan, no moving bar. */ done?: boolean }) {
  return (
    <div className="gd-reading flex w-full flex-col items-center gap-5 rounded-[22px] border-2 border-[var(--gd-step)] bg-[var(--lc-bubble)] px-6 py-10 text-center lg:py-[clamp(40px,calc(var(--gd-vh,1vh)*7),84px)]" style={{ viewTransitionName: "gd-drop" }}>
      {done ? (
        <span className="grid size-16 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="size-8 stroke-[3]" />
        </span>
      ) : file && pageCount > 0 ? (
        <span className="flex max-w-full items-center">
          {/* The wizard, cropped at its wand tip so the picture's own beam never reaches the pages. */}
          <span aria-hidden className="relative z-10 h-[88px] w-[99px] shrink-0 overflow-hidden [mask-image:linear-gradient(to_right,#000_90%,transparent)] sm:h-[136px] sm:w-[153px]">
            <img src="/add-book/wizard-scan.png" alt="" draggable={false} className="absolute left-0 top-0 h-full w-auto max-w-none" />
          </span>
          {/* The beam is drawn here: it widens from the wand to the pages' height and fades out before the first page. */}
          <span aria-hidden className="lcl-beam relative -ml-1.5 mr-1.5 h-[76px] w-[26px] shrink-0 sm:mr-2 sm:h-[112px] sm:w-[64px]">
            <span className="lcl-beam-cone" />
            {[0, 1, 2].map((i) => <span key={i} className="lcl-beam-spark" style={{ animationDelay: `${i * 0.6}s`, top: `${44 + (i - 1) * 9}%` }} />)}
          </span>
          <ScanPages file={file} pageCount={pageCount} />
        </span>
      ) : <span className="grid size-16 place-items-center rounded-full bg-[var(--lc-accent-soft)] text-[var(--lc-accent-text)]"><FileText className="size-7" /></span>}
      <span className="flex max-w-full flex-col items-center gap-1">
        <span className="max-w-full truncate text-[17px] font-semibold lg:text-[19px]">{file?.name}</span>
        <span className="text-[14px] text-muted-foreground lg:text-[15px]">{done ? <Plural value={pageCount} one="# page · read" other="# pages · read" /> : pageCount > 0 ? <Plural value={pageCount} one="# page · reading" other="# pages · reading" /> : <Trans>Opening the PDF…</Trans>}</span>
      </span>
      {!done && (
        <span aria-hidden className="gd-reading-bar h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-muted">
          <span />
        </span>
      )}
    </div>
  )
}
