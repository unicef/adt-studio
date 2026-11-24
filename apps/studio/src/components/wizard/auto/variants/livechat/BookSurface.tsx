import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowUp, Loader2, Trash2, Upload } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn, formatBytes } from "@/lib/utils"
import type { EngineRun } from "../../engine/useEngineRun"
import type { SetupFailure } from "../../recommendation/client"
import { ScopeField, useScopeSummary } from "../../../core/fields/ScopeField"
import { Book3D } from "../../../core/Book3D"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { Chip } from "../chat/bubbles"
import { EngineError } from "../chat/EngineError"
import { Scanner } from "./Scanner"
import { DoneLine, StageHead, Surface } from "./Surface"

const HEAD = "lc-book-head"

/** The book itself: cover, title, size, which pages to convert (one tap away), replace or remove. */
function BookInfo({ flow, frozen }: { flow: UploadFlow; frozen: boolean }) {
  const { t } = useLingui()
  const [pages, setPages] = useState(false)
  const scope = useScopeSummary(flow.pageCount)
  return (
    <div inert={frozen} className="flex w-[260px] shrink-0 flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="grid w-[84px] shrink-0 place-items-center">
          <Book3D key={flow.fileKey} src={flow.cover} alt={flow.title} height={112} maxWidth={84} settle />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="line-clamp-2 text-[17px] font-bold leading-tight tracking-[-0.015em]">{flow.title}</p>
          <p className="text-[12.5px] text-muted-foreground">{flow.file && formatBytes(flow.file.size)}</p>
          <div className="mt-1 flex gap-0.5">
            <button type="button" onClick={flow.openPicker} aria-label={t`Replace PDF`} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Upload className="size-3.5" />
            </button>
            <button type="button" onClick={flow.clear} aria-label={t`Remove PDF`} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-[14px]">
        <span className="font-semibold">{scope}</span>
        <button type="button" aria-expanded={pages} onClick={() => setPages((p) => !p)} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
          {pages ? <Trans>Done</Trans> : <Trans>Choose pages</Trans>}
        </button>
      </p>
      <Collapsible shown={pages}>
        <div inert={!pages}>
          <ScopeField />
        </div>
      </Collapsible>
    </div>
  )
}

function useElapsed(running: boolean) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) return setS(0)
    const start = performance.now()
    const id = window.setInterval(() => setS(Math.floor((performance.now() - start) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [running])
  return s
}

/**
 * The first living message. With no PDF it is the drop stage; then it reads the book (the real
 * pages drift under a light, with one honest sentence); a failure turns the same stage into the
 * error and its actions. Once the answer lands it shrinks to "Read <title> · 52 pages".
 */
export function BookSurface({ flow, validFile, rejected, run, failure, done, expanded, frozen, onOpen, onCollapse, onRetry, onManual }: { flow: UploadFlow; validFile: boolean; rejected: boolean; run: EngineRun; failure?: SetupFailure; done: boolean; expanded: boolean; frozen: boolean; onOpen: () => void; onCollapse: () => void; onRetry: () => void; onManual: () => void }) {
  const scope = useScopeSummary(flow.pageCount)
  const elapsed = useElapsed(run.status === "running")
  const slow = run.status === "running" && run.slow

  if (!validFile)
    return (
      <Surface name="lc-book" expanded labelledBy={HEAD}>
        <div className="flex flex-col items-center gap-6 px-8 pb-6 pt-10 text-center">
          <h1 id={HEAD} className="text-[40px] font-bold leading-[1.02] tracking-[-0.035em]">
            <Trans>
              Let&apos;s set up your <span className="bg-gradient-to-br from-brand-400 to-brand-700 bg-clip-text text-transparent">book</span>, together.
            </Trans>
          </h1>
          <button type="button" onClick={flow.openPicker} className="group flex w-full max-w-[560px] flex-col items-center gap-3 rounded-[24px] border-2 border-dashed border-brand-300 bg-brand-50/50 px-6 py-9 transition-[border-color,background-color] duration-200 hover:border-brand-500 hover:bg-brand-50">
            <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_10px_26px_-8px_rgba(43,127,255,0.8)] transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transition-none">
              {flow.loading ? <Loader2 className="size-6 animate-spin motion-reduce:animate-none" /> : <ArrowUp className="size-6" />}
            </span>
            <span className="text-[18px] font-semibold">{flow.loading ? <Trans>Reading PDF…</Trans> : <Trans>Drop your PDF here</Trans>}</span>
            <span className="text-[14px] text-muted-foreground">
              <Trans>
                or <span className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">browse your files</span>
              </Trans>
            </span>
          </button>
          <p role="alert" className="-mt-2 min-h-5 text-[14px] font-medium text-destructive">
            {rejected ? <Trans>That file isn&apos;t a PDF. Send a PDF.</Trans> : flow.error === "password" ? <Trans>This PDF is password-protected. Remove the password, or send another file.</Trans> : flow.error ? <Trans>I couldn&apos;t open this PDF. It may be damaged.</Trans> : null}
          </p>
        </div>
      </Surface>
    )

  if (done && !expanded)
    return (
      <Surface name="lc-book" expanded={false} labelledBy={HEAD}>
        <DoneLine onOpen={onOpen} locked={frozen}>
          <span id={HEAD}>
            <Trans>
              Read <span className="font-semibold">{flow.title}</span> · {scope}
            </Trans>
          </span>
        </DoneLine>
      </Surface>
    )

  return (
    <Surface name="lc-book" expanded labelledBy={HEAD}>
      <div className="flex flex-col gap-5 p-6">
        <StageHead
          id={HEAD}
          title={failure ? <Trans>I couldn&apos;t read your book</Trans> : done ? <Trans>Your book</Trans> : <Trans>Reading your book</Trans>}
          onCollapse={done ? onCollapse : undefined}
          actions={
            !done && !failure ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-medium tabular-nums text-muted-foreground" aria-hidden>
                <span className="lc-glow size-2 rounded-full bg-brand-500" />
                <Trans>{elapsed} s</Trans>
              </span>
            ) : undefined
          }
        />
        <div className="flex items-start gap-6">
          <BookInfo flow={flow} frozen={frozen} />
          {!done && (
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <Scanner file={flow.file!} pageCount={flow.pageCount} stopped={!!failure} />
              {failure ? (
                <EngineError failure={failure} current onRetry={onRetry} onManual={onManual} />
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-[15px]">
                  <p className={cn(slow && "font-medium")}>{slow ? <Trans>This is taking longer than usual. I&apos;ll keep at it.</Trans> : <Trans>I measure the pages, then two AI readings look at samples.</Trans>}</p>
                  {slow && (
                    <Chip onClick={onManual}>
                      <Trans>Set it up myself</Trans>
                    </Chip>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Surface>
  )
}
