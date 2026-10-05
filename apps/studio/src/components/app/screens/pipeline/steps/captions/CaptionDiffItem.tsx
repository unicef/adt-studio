import { Trans } from "@lingui/react/macro"
import { BASE_URL } from "@/api/client"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"

export function CaptionDiffItem({
  label,
  cap,
  diff,
}: {
  label: string
  cap: CaptionEntry
  diff?: React.ReactNode
}) {
  return (
    <span className="flex flex-col gap-2">
      <img
        src={`${BASE_URL}/books/${label}/images/${cap.imageId}`}
        alt=""
        className="max-h-[46vh] w-full rounded-md border bg-muted object-contain"
      />
      <span className="flex flex-col gap-0.5">
        <span
          className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
          title={cap.imageId}
        >
          {cap.decorative ? <Trans>Decorative</Trans> : <Trans>Caption</Trans>}
        </span>
        {cap.decorative ? (
          <span className="text-[11px] italic text-muted-foreground">
            <Trans>No caption (decorative)</Trans>
          </span>
        ) : (
          <span className="text-foreground">{diff ?? cap.caption}</span>
        )}
      </span>
    </span>
  )
}
