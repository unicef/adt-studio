import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { FileText, HardDrive, Paperclip, Trash2, Upload } from "lucide-react"
import { cn, formatBytes } from "@/lib/utils"
import { ScopeField } from "../../../core/fields/ScopeField"
import { Book3D } from "../../../core/Book3D"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"

export const SCOPE_ANCHOR = "chat-scope"

/**
 * The PDF the user sent, as their own message: the standing cover, title, pages and size, and right
 * there how much of it to convert (the upload card's page choice). Replace / remove stay at hand.
 */
export function Attachment({ flow, frozen }: { flow: UploadFlow; frozen: boolean }) {
  const { t } = useLingui()
  if (!flow.file) return null
  return (
    <div inert={frozen} className="w-full max-w-[480px] overflow-hidden rounded-[24px] rounded-br-[6px] bg-card text-left ring-1 ring-brand-200 shadow-[0_18px_40px_-24px_rgba(43,127,255,0.7)]">
      <div className="relative flex gap-4 bg-gradient-to-br from-brand-50 via-card to-card p-4 pr-5">
        <div className="grid w-[92px] shrink-0 place-items-center py-1 sm:w-[104px]">
          <Book3D key={flow.fileKey} src={flow.cover} alt={flow.title} height={128} maxWidth={96} settle />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className="inline-flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-brand-700">
            <Paperclip className="size-3" />
            <Trans>PDF</Trans>
          </p>
          <p className="line-clamp-2 text-[19px] font-bold leading-tight tracking-[-0.015em]">{flow.title}</p>
          <p className="truncate text-[12.5px] text-muted-foreground">{flow.file.name}</p>
          <p className="mt-0.5 inline-flex flex-wrap items-center gap-x-1.5 text-[12.5px] font-medium text-muted-foreground">
            <FileText className="size-3.5" />
            {flow.pageCount > 0 ? <Plural value={flow.pageCount} one="# page" other="# pages" /> : <Trans>Counting pages…</Trans>}
            <span aria-hidden>·</span>
            <HardDrive className="size-3.5" />
            {formatBytes(flow.file.size)}
          </p>
        </div>
      </div>
      <div id={SCOPE_ANCHOR} tabIndex={-1} className="border-t border-border/70 px-4 pb-3 pt-3 outline-none">
        <ScopeField />
      </div>
      <div className={cn("flex items-center gap-2 border-t border-border/70 px-4 py-2.5")}>
        <button type="button" onClick={flow.openPicker} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]">
          <Upload className="size-3.5" />
          <Trans>Replace PDF</Trans>
        </button>
        <button type="button" onClick={flow.clear} aria-label={t`Remove PDF`} className="ml-auto grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
