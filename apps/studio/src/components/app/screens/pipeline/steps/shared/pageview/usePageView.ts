import { useVariant, type VariantState } from "@/components/app/lab/variants"

export type PageView = VariantState["pageview"]

export function usePageView(): PageView {
  return useVariant("pageview")
}
