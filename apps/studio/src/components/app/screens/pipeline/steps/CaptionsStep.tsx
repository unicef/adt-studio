import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { EyeOff, Undo2 } from "lucide-react"
import { api, BASE_URL, type PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { useSaveCaptions } from "./shared/mutations"
import { StepEmpty, StepLoading, StepShell } from "./shared/StepShell"
import { EditableText, RowAction, SaveError, StepBody, StepCard, StepGroupLabel, StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"

type Caption = NonNullable<PageDetail["imageCaptioning"]>["captions"][number]

function PageCaptions({
  label,
  pageId,
  pageNumber,
  captions,
  accent,
}: {
  label: string
  pageId: string
  pageNumber: number
  captions: Caption[]
  accent: string
}) {
  const { t } = useLingui()
  const save = useSaveCaptions(label, pageId)

  const patch = (imageId: string, changes: Partial<Caption>) => {
    save.mutate({
      captions: captions.map((c) => (c.imageId === imageId ? { ...c, ...changes } : c)),
    })
  }

  return (
    <>
      <StepGroupLabel>{t`Page ${pageNumber}`}</StepGroupLabel>
      <SaveError error={save.error} />
      {captions.map((caption) => (
        <StepCard key={caption.imageId} muted={caption.decorative} accent={accent}>
          <div className="flex gap-3.5">
            <img
              src={`${BASE_URL}/books/${label}/images/${caption.imageId}`}
              alt=""
              loading="lazy"
              className="h-[120px] w-[120px] shrink-0 rounded-lg border object-contain"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{caption.imageId}</span>
                {caption.decorative && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    <Trans>decorative</Trans>
                  </span>
                )}
                <div className="ml-auto flex gap-1">
                  <RowAction
                    icon={caption.decorative ? Undo2 : EyeOff}
                    label={caption.decorative ? t`Mark as meaningful` : t`Mark as decorative`}
                    onClick={() => patch(caption.imageId, { decorative: !caption.decorative })}
                  />
                </div>
              </div>

              <EditableText
                value={caption.caption}
                ariaLabel={t`alternative description`}
                placeholder={t`Describe this image…`}
                isSaving={save.isPending}
                onSave={(text) => patch(caption.imageId, { caption: text, source: "manual" })}
                className={cn(
                  "text-[12.5px] leading-relaxed",
                  !caption.caption && "italic",
                )}
              />

              {caption.reasoning && (
                <p className="px-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {caption.reasoning}
                </p>
              )}
            </div>
          </div>
        </StepCard>
      ))}
    </>
  )
}

export function CaptionsStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()

  const withImages = useMemo(() => pages.filter((p) => p.imageCount > 0), [pages])

  const details = useQueries({
    queries: withImages.map((page) => ({
      queryKey: ["books", label, "pages", page.pageId],
      queryFn: () => api.getPage(label, page.pageId),
    })),
  })

  const isLoading = details.some((d) => d.isLoading)

  const perPage = useMemo(
    () =>
      withImages
        .map((page, i) => ({
          page,
          captions: details[i]?.data?.imageCaptioning?.captions ?? [],
        }))
        .filter((entry) => entry.captions.length > 0),
    [withImages, details],
  )

  const [activePageId, setActivePageId] = useState<string | null>(null)

  if (isLoading) return <StepLoading {...props} />
  if (perPage.length === 0) return <StepEmpty {...props} />

  const total = perPage.reduce((sum, e) => sum + e.captions.length, 0)
  const missing = perPage.reduce(
    (sum, e) => sum + e.captions.filter((c) => !c.decorative && !c.caption.trim()).length,
    0,
  )
  const shown = activePageId ? perPage.filter((e) => e.page.pageId === activePageId) : perPage

  return (
    <StepShell
      {...props}
      chips={[t`${total} images`, missing > 0 ? t`${missing} without a description` : t`All described`]}
      canApply={missing === 0}
      rail={
        <StepRail
          heading={<Trans>Images by page</Trans>}
          hex={plugin.hex}
          entries={perPage.map((e) => ({
            key: e.page.pageId,
            title: t`Page ${e.page.pageNumber}`,
            count: e.captions.length,
          }))}
          activeKey={activePageId}
          onSelect={(key) => setActivePageId((cur) => (cur === key ? null : key))}
          footer={<Trans>Select a page to filter. Click again to show all.</Trans>}
        />
      }
    >
      <StepBody title={<Trans>Image descriptions</Trans>} meta={t`${total} images`}>
        {shown.map((entry) => (
          <PageCaptions
            key={entry.page.pageId}
            label={label}
            pageId={entry.page.pageId}
            pageNumber={entry.page.pageNumber}
            captions={entry.captions}
            accent={plugin.hex}
          />
        ))}
      </StepBody>
    </StepShell>
  )
}
