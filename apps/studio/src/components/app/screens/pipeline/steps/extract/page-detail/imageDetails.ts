import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { PageImageEntry } from "./usePageDetailData"

export function imageSizeText(entry: PageImageEntry): string | null {
  return entry.width && entry.height ? `${entry.width} × ${entry.height}` : null
}

export function imagePositionText(i18n: I18n, entry: PageImageEntry): string | null {
  const bounds = entry.bounds
  if (!bounds) return null
  return i18n._(
    msg`Position ${Math.round(bounds.x)}, ${Math.round(bounds.y)} → ${Math.round(bounds.width)}×${Math.round(bounds.height)} pt`,
  )
}

export function imageDetailLine(entry: PageImageEntry): string {
  return [entry.imageId, imageSizeText(entry)].filter(Boolean).join(" · ")
}

export function imageDetailTooltip(i18n: I18n, entry: PageImageEntry): string {
  return [imageDetailLine(entry), imagePositionText(i18n, entry)].filter(Boolean).join("\n")
}
