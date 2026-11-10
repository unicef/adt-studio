import { useCallback } from "react"
import { useLingui } from "@lingui/react/macro"
import { sectionTypeName } from "./sectionGroups"

export function useSectionLabel() {
  const { t } = useLingui()
  return useCallback(
    (sectionIndex: number, sectionType?: string) => {
      if (sectionIndex < 0) return t`Other images`
      const number = sectionIndex + 1
      const type = sectionTypeName(sectionType)
      return type ? t`Section ${number} · ${type}` : t`Section ${number}`
    },
    [t],
  )
}
