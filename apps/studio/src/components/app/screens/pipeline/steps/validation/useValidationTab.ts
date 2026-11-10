import { useCallback } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"

export type ValidationTab = "accessibility" | "reviewer"

const REVIEWER_TABS = new Set(["reviewer", "reviewer-validation"])

export function parseValidationTab(value: unknown): ValidationTab {
  return typeof value === "string" && REVIEWER_TABS.has(value) ? "reviewer" : "accessibility"
}

export function useValidationTab(label: string, reviewerEnabled: boolean): [ValidationTab, (tab: ValidationTab) => void] {
  const search = useSearch({ strict: false }) as { tab?: unknown }
  const navigate = useNavigate()
  const requested = parseValidationTab(search.tab)
  const tab: ValidationTab = reviewerEnabled ? requested : "accessibility"

  const select = useCallback(
    (next: ValidationTab) => {
      void navigate({
        to: "/pipeline/$label/$step",
        params: { label, step: "validation" },
        search: (prev) => ({ ...prev, tab: next === "reviewer" ? "reviewer-validation" : undefined }),
        replace: true,
      })
    },
    [navigate, label],
  )

  return [tab, select]
}
