import { lowResThumbnail } from "@/components/app/screens/pipeline/shared/page-thumbnail/pageThumbnail"
import { PagePreview } from "../PagePreview"
import type { PageSize } from "../usePageDetailData"

const NONE: never[] = []
const noop = () => {}

export function PlaceholderFrame({
  label,
  pageId,
  ratio,
  pageSrc,
  size,
  pageNumber,
}: {
  label: string
  pageId: string
  ratio: number
  pageSrc: string | null
  size: PageSize | null
  pageNumber: number
}) {
  if (pageSrc)
    return (
      <PagePreview
        src={pageSrc}
        lowSrc={lowResThumbnail(label, pageId)}
        pageNumber={pageNumber}
        size={size ?? { w: ratio * 1000, h: 1000 }}
        entries={NONE}
        hoverId={null}
        selectedId={null}
        onHover={noop}
        onSelect={noop}
      />
    )
  return (
    <div
      aria-hidden
      className="max-h-full max-w-full overflow-hidden rounded-xl border bg-card shadow-sm"
      style={{ width: `min(100cqw, calc(100cqh * ${ratio.toFixed(4)}))`, aspectRatio: ratio.toFixed(4) }}
    >
      <div className="size-full bg-muted/70 motion-safe:animate-pulse" />
    </div>
  )
}
