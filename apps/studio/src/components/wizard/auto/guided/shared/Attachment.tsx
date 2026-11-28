import { HardDrive } from "lucide-react"
import { formatBytes } from "@/lib/utils"
import { useScopeSummary } from "../../../core/fields/scope"
import { Book3D } from "../../../core/Book3D"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"

/**
 * The PDF the user sent, back on Upload: the standing cover, title, size and the pages to convert.
 * Only what it is: changing the PDF is the PDF row's Change PDF (which asks first), and the pages
 * are Check's Pages screen.
 */
export function Attachment({ flow }: { flow: UploadFlow }) {
  const scope = useScopeSummary(flow.pageCount)
  if (!flow.file) return null
  return (
    <div className="lc-surface w-full max-w-[400px] overflow-hidden rounded-br-[8px] text-left">
      <div className="flex gap-3.5 p-3.5">
        <div className="grid w-[70px] shrink-0 place-items-center py-1">
          <Book3D key={flow.fileKey} src={flow.cover} alt={flow.title} height={92} maxWidth={68} settle />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p className="line-clamp-2 text-[16px] font-semibold leading-tight tracking-[-0.015em]">{flow.title}</p>
          <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
            <HardDrive className="size-3.5" />
            {formatBytes(flow.file.size)}
          </p>
          <p className="mt-1 text-[13.5px] font-semibold">{scope}</p>
        </div>
      </div>
    </div>
  )
}
