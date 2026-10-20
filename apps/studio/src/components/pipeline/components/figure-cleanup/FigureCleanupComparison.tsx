import { Trans, useLingui } from "@lingui/react/macro"
import type { ImageCleanupCandidate } from "@adt/types"
import { BASE_URL } from "@/api/client"

export function FigureCleanupComparison({ bookLabel, imageId, candidate }: {
  bookLabel: string; imageId: string; candidate: ImageCleanupCandidate
}) {
  const { t } = useLingui()
  const current = candidate.inputSource === "current-image"
  const items = [
    ...(!current ? [{ id: imageId, label: t`Current image` }] : []),
    { id: candidate.cropImageId, label: current ? t`Current image` : t`Selected page region` },
    { id: candidate.imageId, label: candidate.operation === "remove-background" ? t`Background removed` : t`Cleaned candidate` },
  ]
  return <>
    <div className={`grid gap-4 ${current ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
      {items.map((item) => <figure key={item.id} className="space-y-2">
        <figcaption className="text-sm font-medium">{item.label}</figcaption>
        <a href={`${BASE_URL}/books/${bookLabel}/images/${item.id}`} target="_blank" rel="noreferrer"
          className="flex h-72 items-center justify-center rounded-lg border p-2 [background:repeating-conic-gradient(#e5e7eb_0%_25%,white_0%_50%)_50%/20px_20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <img src={`${BASE_URL}/books/${bookLabel}/images/${item.id}`} alt={item.label} className="max-h-full max-w-full object-contain" />
        </a>
      </figure>)}
    </div>
    <p className="text-sm text-muted-foreground">{candidate.operation === "remove-background"
      ? <Trans>Check that labels, thin lines, and all parts of the figure remain. The checkerboard shows transparent areas. Click an image to inspect it at full size.</Trans>
      : <Trans>Check labels, fine details, and edges against the page crop. Click an image to inspect it at full size. AI can change content; transparency depends on the image model.</Trans>}
    </p>
    <p className="text-sm text-muted-foreground"><Trans>Accepting updates this image in Extract and wherever it appears in Storyboard. Each changed page gets a new version, preserving its layout and text. Earlier versions remain available in history.</Trans></p>
  </>
}
