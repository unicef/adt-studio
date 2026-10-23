import { useVariant, type VariantState } from "@/components/app/lab/variants"

export type ListView = VariantState["listview"]

export function useListView(slug: string): ListView {
  const view = useVariant("listview")
  return slug === "toc" && view === "cards" ? "rows" : view
}
