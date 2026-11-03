import { getAdtUrl } from "@/api/client"
import { useAdtPages } from "@/hooks/use-adt-pages"
import { previewHrefForSection } from "@/components/app/screens/pipeline/shared/previewTarget"
import { usePreviewPackage, type PreviewPackage } from "./usePreviewPackage"

export interface PreviewSource {
  pkg: PreviewPackage
  src: string | null
}

export function usePreviewSource(label: string, sectionId: string | null, href: string | null): PreviewSource {
  const pkg = usePreviewPackage(label, true)
  const packaged = pkg.status === "ready" && pkg.version !== null
  const needsManifest = !href && !!sectionId
  const manifestQuery = useAdtPages(label, { enabled: packaged && needsManifest })
  const targetResolved = !needsManifest || manifestQuery.isSuccess || manifestQuery.isError
  const path = href ?? previewHrefForSection(sectionId, manifestQuery.data) ?? ""
  const src = packaged && targetResolved ? `${getAdtUrl(label)}/v-${pkg.version}/${path}` : null
  return { pkg, src }
}
