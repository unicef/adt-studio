import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { evidenceList, PageViewer } from "../../Evidence"
import "./evidence.css"

function Tag({ file, page, onOpen }: { file: File; page: number; onOpen: () => void }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page, 160)
  return (
    <button type="button" onClick={onOpen} aria-label={t`Show page ${page} larger`} className="ev-peek-tag">
      <Trans>p.{page}</Trans>
      <span aria-hidden className="ev-peek">
        <span className="grid h-[132px] w-[100px] place-items-center overflow-hidden rounded-[6px] bg-muted">{src ? <img src={src} alt="" className="max-h-full max-w-full" /> : <FileText className="size-5 text-muted-foreground/50" />}</span>
        <span className="mt-1 block text-center text-[11px] font-semibold text-muted-foreground">
          <Trans>page {page}</Trans>
        </span>
      </span>
    </button>
  )
}

/**
 * Tiny page tags after a claim ("in Portuguese p.4"): hovering or focusing one grows a peek of the
 * page out of the tag; clicking opens it large. At most two per claim.
 */
export function PeekTags({ file, pages }: { file: File | null | undefined; pages: number[] }) {
  const [viewer, setViewer] = useState<number | null>(null)
  const list = evidenceList(pages)
  if (!file || list.length === 0) return null
  return (
    <>
      {list.slice(0, 2).map((p) => (
        <Tag key={p} file={file} page={p} onOpen={() => setViewer(p)} />
      ))}
      <PageViewer file={file} pages={list} page={viewer} onPage={setViewer} />
    </>
  )
}
