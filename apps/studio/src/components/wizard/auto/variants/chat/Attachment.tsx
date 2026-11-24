import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { HardDrive, Trash2, Upload } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn, formatBytes } from "@/lib/utils"
import { ScopeField, useScopeSummary } from "../../../core/fields/ScopeField"
import { Book3D } from "../../../core/Book3D"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"

/**
 * The PDF the user sent, as their own message: the standing cover, title, pages and size. Which
 * pages to convert is one tap away ("Choose pages" opens the upload card's page choice).
 */
export function Attachment({ flow, frozen }: { flow: UploadFlow; frozen: boolean }) {
  const { t } = useLingui()
  const [pages, setPages] = useState(false)
  const scope = useScopeSummary(flow.pageCount)
  if (!flow.file) return null
  return (
    <div inert={frozen} className="w-full max-w-[400px] overflow-hidden rounded-[24px] rounded-br-[6px] bg-card text-left ring-1 ring-brand-200 shadow-[0_18px_40px_-24px_rgba(43,127,255,0.7)]">
      <div className="relative flex gap-3.5 bg-gradient-to-br from-brand-50 via-card to-card p-3.5">
        <div className="grid w-[70px] shrink-0 place-items-center py-1">
          <Book3D key={flow.fileKey} src={flow.cover} alt={flow.title} height={92} maxWidth={68} settle />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p className="line-clamp-2 pr-14 text-[17px] font-bold leading-tight tracking-[-0.015em]">{flow.title}</p>
          <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
            <HardDrive className="size-3.5" />
            {formatBytes(flow.file.size)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px]">
            <span className="font-semibold">{scope}</span>
            <button type="button" aria-expanded={pages} onClick={() => setPages((p) => !p)} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
              {pages ? <Trans>Done</Trans> : <Trans>Choose pages</Trans>}
            </button>
          </p>
        </div>
        <div className="absolute right-2 top-2 flex">
          <button type="button" onClick={flow.openPicker} aria-label={t`Replace PDF`} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Upload className="size-3.5" />
          </button>
          <button type="button" onClick={flow.clear} aria-label={t`Remove PDF`} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <Collapsible shown={pages}>
        <div inert={!pages} className={cn("border-t border-border/70 px-3.5 pb-3 pt-3")}>
          <ScopeField />
        </div>
      </Collapsible>
    </div>
  )
}
