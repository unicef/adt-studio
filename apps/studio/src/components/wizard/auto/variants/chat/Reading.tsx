import { Trans } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import type { EngineRun } from "../../engine/useEngineRun"
import { usePageThumb } from "../../../core/pdf/usePageThumb"
import { IdeaReading, READING_STAYS } from "../livechat/ideas/loader/IdeaReading"
import { Chip } from "./bubbles"
import { useIdea } from "./ideas"
import { useLiving } from "./look"
import "./chat.css"

function Page({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 64)
  return (
    <span className="relative grid h-[88px] w-[66px] place-items-center overflow-hidden bg-white">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <FileText className="size-4 text-slate-300" />}
    </span>
  )
}

/** While the engine reads: two real pages of the book, open, with a soft light passing over them. Decoration only. */
export function Reading({ file, pageCount }: { file: File; pageCount: number }) {
  const first = Math.min(2, Math.max(1, pageCount - 1))
  return (
    <span aria-hidden className="relative flex w-fit overflow-hidden rounded-[6px] shadow-[0_12px_28px_-14px_rgba(15,23,42,0.5)] ring-1 ring-border">
      <Page file={file} page={first} />
      <span className="w-px bg-slate-300" />
      <Page file={file} page={Math.min(pageCount, first + 1)} />
      <span className="chat-scan pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-brand-400/35 to-transparent" />
    </span>
  )
}

/** The loader idea picked in the lab; always "now" outside Living chat. */
export function useLoaderIdea() {
  const idea = useIdea("loader")
  return useLiving() ? idea : "now"
}

/** Whether the reading message stays, finished, after the answer is in (only some lab ideas; never "now"). */
export const readingStays = (idea: string) => READING_STAYS.has(idea)

type ReadingMessageProps = { idea: string; file: File; pageCount: number; run: EngineRun; rec: SetupRecommendation | null; onManual: () => void }

/** The assistant's message while the engine reads: what it's doing, two real pages, and a way out when it's slow. */
export function ReadingMessage({ idea, file, pageCount, run, rec, onManual }: ReadingMessageProps) {
  if (idea !== "now") return <IdeaReading idea={idea} file={file} pageCount={pageCount} run={run} rec={rec} onManual={onManual} />
  return (
    <div className="flex items-center gap-3.5">
      <Reading file={file} pageCount={pageCount} />
      <div className="flex min-w-0 flex-col gap-2">
        <p>{run.status === "running" && run.slow ? <Trans>This is taking longer than usual. I&apos;ll keep at it.</Trans> : <Trans>Reading your book. This takes a few seconds.</Trans>}</p>
        {run.status === "running" && run.slow && (
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
