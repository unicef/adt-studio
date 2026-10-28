import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { ImagesVersionPicker } from "./ImagesVersionPicker"
import type { PageDetailData } from "./usePageDetailData"

const PICKER_TRIGGER = cn("h-6 gap-1 rounded-md border bg-card px-1.5 text-[11.5px]! font-semibold! text-foreground hover:bg-muted")

export function ImagesVersion({ label, pageId, data, compact = false }: { label: string; pageId: string; data: PageDetailData; compact?: boolean }) {
  const { t } = useLingui()
  if (!data.page || data.page.versions.imageClassification == null) return null
  const version = data.page.versions.imageClassification
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
      {!compact && <Trans>Selection version</Trans>}
      <ImagesVersionPicker
        label={label}
        pageId={pageId}
        page={data.page}
        images={data.images}
        triggerClassName={PICKER_TRIGGER}
        triggerLabel={t`Image selection version ${version}. Change version`}
      />
    </span>
  )
}
