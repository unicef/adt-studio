import { Trans } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import type { PageDetailData } from "./usePageDetailData"

export function noImagesLine(data: PageDetailData) {
  return data.imageFilterRunning && !data.images.effective ? <Trans>Classifying images…</Trans> : <Trans>No images on this page</Trans>
}

export function noTextLine(page: PageDetail) {
  return page.extractionWarning ? <Trans>No text layer on this page</Trans> : <Trans>No text on this page</Trans>
}
