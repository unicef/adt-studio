import { useCallback } from "react"
import { useLingui } from "@lingui/react/macro"
import { getSectionTypeLabelMsg } from "@/lib/section-constants"

export function useSectionTypeLabel() {
  const { i18n } = useLingui()
  return useCallback(
    (sectionType: string) => {
      if (!sectionType) return ""
      const descriptor = getSectionTypeLabelMsg(sectionType)
      return descriptor ? i18n._(descriptor) : sectionType.replace(/_/g, " ")
    },
    [i18n],
  )
}

export function useSectionHeading() {
  const { t } = useLingui()
  const typeLabel = useSectionTypeLabel()
  return useCallback(
    (block: { sectionIndex: number; sectionType: string }) => {
      const number = block.sectionIndex + 1
      const type = typeLabel(block.sectionType)
      return type ? t`Section ${number} · ${type}` : t`Section ${number}`
    },
    [t, typeLabel],
  )
}
