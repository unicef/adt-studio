import { useNavigate, useSearch } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import type { BookStepSearch } from "@/lib/book-step-search"

export function ValidationReturnBanner({ label }: { label: string }) {
  const search = useSearch({ strict: false }) as BookStepSearch
  const navigate = useNavigate()
  const context = search.validationReturn
  if (!context) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-xs">
      <span><Trans>Repair suggestion. Review decisions remain unchanged.</Trans></span>
      <Button variant="outline" size="sm" onClick={() => void navigate({
        to: "/books/$label/$step", params: { label, step: "validation" },
        search: { tab: context.tab, validationContext: context },
      })}>
        <Trans>Return to Validation</Trans>
      </Button>
    </div>
  )
}
