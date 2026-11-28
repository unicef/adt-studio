import { Plural } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import { cn, formatBytes } from "@/lib/utils"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"

export const MUTED = "text-muted-foreground"

/** The PDF's first page as a small cover. */
export function Cover({ flow, size = "sm" }: { flow: UploadFlow; size?: "sm" | "md" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-muted ring-1 ring-border", size === "md" ? "h-10 w-[30px] rounded-[5px] shadow-[0_4px_10px_-6px_rgba(15,23,42,0.45)]" : "h-6 w-[18px] rounded-[4px]")}>
      {flow.cover ? <img key={flow.cover} src={flow.cover} alt="" className="size-full object-cover animate-in fade-in duration-300 motion-reduce:animate-none" /> : <FileText className={cn(size === "sm" ? "size-3" : "size-4", MUTED)} />}
    </span>
  )
}

/** "100 pages · 2.4 MB" */
export function PdfMeta({ flow }: { flow: UploadFlow }) {
  return (
    <>
      {flow.pageCount > 0 && (
        <>
          <Plural value={flow.pageCount} one="# page" other="# pages" />
          {flow.file && " · "}
        </>
      )}
      {flow.file && formatBytes(flow.file.size)}
    </>
  )
}
