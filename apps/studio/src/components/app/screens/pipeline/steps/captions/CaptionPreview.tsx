import { useLingui } from "@lingui/react/macro"
import { usePage } from "@/hooks/use-pages"
import { useNearViewport } from "../shared/pageview/useNearViewport"

export function CaptionPreview({ label, pageId }: { label: string; pageId: string }) {
  const { t } = useLingui()
  const [ref, near] = useNearViewport<HTMLSpanElement>(300)
  const query = usePage(label, pageId, { enabled: near })
  const first = query.data?.imageCaptioning?.captions.find((entry) => entry.decorative !== true && entry.caption.trim() !== "")?.caption

  if (query.data || query.isError) {
    return (
      <span ref={ref} className="animate-in fade-in duration-300 motion-reduce:animate-none">
        {first ?? (query.isError ? "" : t`No description yet`)}
      </span>
    )
  }
  return (
    <span ref={ref} aria-hidden className="flex flex-col gap-1.5 pt-1">
      <span className="h-2 w-full rounded bg-muted motion-safe:animate-pulse" />
      <span className="h-2 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
    </span>
  )
}
