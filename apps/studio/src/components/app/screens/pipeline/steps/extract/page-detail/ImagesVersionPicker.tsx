import { useLingui } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { extractedImageUrl, type ExtractImagesApi, type ImageClassData } from "../useExtractImages"

export function ImagesVersionPicker({
  label,
  pageId,
  page,
  images,
  triggerClassName,
  triggerLabel,
}: {
  label: string
  pageId: string
  page: PageDetail
  images: ExtractImagesApi
  triggerClassName?: string
  triggerLabel?: string
}) {
  const { t } = useLingui()
  return (
    <VersionPicker
      step="image-filtering"
      itemId={pageId}
      currentVersion={page.versions.imageClassification}
      saving={images.save.isPending}
      dirty={images.isDirty}
      bookLabel={label}
      pendingLabel={images.pendingLabel}
      pendingLabelKey={images.pendingLabelKey}
      pendingScope={{ page: pageId }}
      onRestored={images.discardChanges}
      onSave={images.saveChanges}
      onDiscard={images.discardChanges}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
      diff={{
        items: (d) => (d as ImageClassData | null)?.images ?? [],
        keyOf: (it) => (it as ImageClassData["images"][number]).imageId,
        hideUnchanged: true,
        renderItem: (it) => {
          const img = it as ImageClassData["images"][number]
          const filtered = img.isPruned
          return (
            <span className="flex flex-col gap-1.5">
              <img
                src={extractedImageUrl(label, img.imageId)}
                alt=""
                className="max-h-[32vh] w-full rounded-md border bg-muted object-contain"
              />
              <span
                className={cn(
                  "w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
                  filtered
                    ? "bg-rose-100 text-rose-700 ring-rose-300"
                    : "bg-emerald-100 text-emerald-700 ring-emerald-300",
                )}
              >
                {filtered ? t`Filtered out` : t`Kept`}
              </span>
              {img.reason ? (
                <span className="text-[11px] text-muted-foreground">{img.reason}</span>
              ) : null}
            </span>
          )
        },
      }}
    />
  )
}
