export type PreviewViewport = "desktop" | "tablet" | "mobile"

export const PREVIEW_VIEWPORTS: readonly PreviewViewport[] = [
  "desktop",
  "tablet",
  "mobile",
]

export const PREVIEW_VIEWPORT_WIDTHS: Record<PreviewViewport, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
}
