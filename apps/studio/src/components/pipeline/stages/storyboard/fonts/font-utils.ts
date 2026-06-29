import { useLingui } from "@lingui/react/macro"
import type { BookFontRole } from "@adt/types"
import type { BookFontWithStatus } from "@/api/client"

const GENERIC_FALLBACK: Record<string, string> = {
  serif: "serif",
  sans: "sans-serif",
  handwriting: "cursive",
  mono: "monospace",
  display: "sans-serif",
}

export function previewFamily(family: string, category?: string | null): string {
  return `'${family}', ${GENERIC_FALLBACK[category ?? "sans"] ?? "sans-serif"}`
}

export type LicenseStatus = "open" | "restricted" | "unverified" | null

export function licenseStatus(font: BookFontWithStatus): LicenseStatus {
  if (font.license?.embeddingRestricted || font.license?.openSource === false) return "restricted"
  if (font.license?.openSource === true) return "open"
  if (font.source === "upload") return "unverified"
  return null
}

export function useRoleLabels(): Record<BookFontRole, string> {
  const { t } = useLingui()
  return {
    heading: t`Headings`,
    paragraph: t`Paragraph`,
    body: t`Body text`,
    caption: t`Captions`,
    decorative: t`Decorative`,
    mono: t`Monospace`,
    unassigned: t`Unassigned`,
  }
}
