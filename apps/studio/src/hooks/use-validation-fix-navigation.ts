import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import type { ValidationNavigationContext } from "@adt/types"
import { api } from "@/api/client"
import { resolveValidationFixDestination, type ValidationFixTarget } from "@/lib/validation-fix-routing"

/** Resolve from a fresh read before leaving; routing itself never writes book data. */
export function useValidationFixNavigation(label: string) {
  const navigate = useNavigate()
  const router = useRouter()
  const search = useSearch({ strict: false })
  const queryClient = useQueryClient()
  const { t } = useLingui()
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const activeRequest = useRef<symbol | null>(null)
  useEffect(() => () => { activeRequest.current = null }, [label])

  const open = async (target: ValidationFixTarget, context: ValidationNavigationContext) => {
    if (activeRequest.current) return
    const request = Symbol()
    activeRequest.current = request
    const sourceLocation = router.state.location
    const isCurrent = () => activeRequest.current === request && router.state.location === sourceLocation
    setPendingLabel(label)
    try {
      const pages = await queryClient.fetchQuery({
        queryKey: ["books", label, "pages"],
        queryFn: () => api.getPages(label),
        staleTime: 0,
      })
      if (!isCurrent()) return
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
      if (activeRequest.current !== request) return
      const returnSearch = { ...search, tab: undefined, validationContext: undefined, validationReturn: context, sectionId: undefined }
      if (destination.kind === "stage") {
        await navigate({ to: "/books/$label/$step", params: { label, step: destination.stage }, search: returnSearch, hash: true })
      } else {
        await navigate({
          to: "/books/$label/$step/$pageId",
          params: { label, step: destination.stage, pageId: destination.pageId },
          search: { ...returnSearch, sectionId: destination.sectionId },
          hash: true,
        })
      }
    } catch {
      if (isCurrent()) toast.error(t`Could not resolve the repair destination. Your finding is unchanged. Try again.`)
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null
        setPendingLabel(null)
      }
    }
  }
  return { open, pending: pendingLabel === label }
}
