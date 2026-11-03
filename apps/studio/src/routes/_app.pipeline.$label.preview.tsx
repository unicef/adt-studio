import { createFileRoute, redirect } from "@tanstack/react-router"
import { ensurePages } from "@/components/app/screens/pipeline/shared/ensurePages"
import { PREVIEW_PARAM, encodePreviewTarget } from "@/components/app/screens/pipeline/preview/surfaces/previewSurface"
import { pagesQueryOptions } from "@/hooks/use-pages"

export interface PreviewSearch {
  section?: string
  href?: string
}

export const Route = createFileRoute("/_app/pipeline/$label/preview")({
  validateSearch: (search: Record<string, unknown>): PreviewSearch => ({
    ...(typeof search.section === "string" && search.section ? { section: search.section } : {}),
    ...(typeof search.href === "string" && search.href ? { href: search.href } : {}),
  }),
  beforeLoad: async ({ context, params, search }) => {
    const preview = { [PREVIEW_PARAM]: encodePreviewTarget({ sectionId: search.section ?? null, href: search.href ?? null }) }
    const pages =
      context.queryClient.getQueryData(pagesQueryOptions(params.label).queryKey) ??
      (await ensurePages(context.queryClient, params.label))
    const page = search.section
      ? pages.find((candidate) => candidate.sections?.some((section) => section.sectionId === search.section))
      : undefined
    if (page) {
      throw redirect({
        to: "/pipeline/$label/pages/$pageId",
        params: { label: params.label, pageId: page.pageId },
        search: preview as never,
        replace: true,
      })
    }
    throw redirect({ to: "/pipeline/$label", params: { label: params.label }, search: preview as never, replace: true })
  },
})
