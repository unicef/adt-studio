import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import type { ValidationNavigationContext } from "@adt/types"
import { api } from "@/api/client"
import { resolveValidationFixDestination, type ValidationFixTarget } from "@/lib/validation-fix-routing"

/** Resolve from a fresh read before leaving; routing itself never writes book data. */
export function useValidationFixNavigation(label: string) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false })
  const queryClient = useQueryClient()
  const { t } = useLingui()
  const [pending, setPending] = useState(false)

  const open = async (target: ValidationFixTarget, context: ValidationNavigationContext) => {
    if (pending) return
    setPending(true)
    try {
      const pages = await queryClient.fetchQuery({
        queryKey: ["books", label, "pages"],
        queryFn: () => api.getPages(label),
        staleTime: 0,
      })
      const destination = resolveValidationFixDestination(target, pages)
      if (destination.unavailable) {
        toast.warning(t`The requested section is no longer available. Opened the page instead.`)
      }
      // Record the source entry too so browser Back restores filters and session.
      await navigate({
        to: "/books/$label/$step", params: { label, step: "validation" },
        search: { ...search, tab: context.tab, validationContext: context },
        hash: true, replace: true,
      })
      const returnSearch = { validationReturn: context }
      if (destination.kind === "stage") {
        await navigate({ to: "/books/$label/$step", params: { label, step: destination.stage }, search: returnSearch })
      } else {
        await navigate({
          to: "/books/$label/$step/$pageId",
          params: { label, step: destination.stage, pageId: destination.pageId },
          search: { ...returnSearch, sectionId: destination.sectionId },
        })
      }
    } catch {
      toast.error(t`Could not resolve the repair destination. Your finding is unchanged. Try again.`)
    } finally {
      setPending(false)
    }
  }
  return { open, pending }
}
