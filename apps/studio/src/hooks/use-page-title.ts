import { useEffect } from "react"
import { useAnnouncer } from "@/components/a11y/LiveRegionAnnouncer"

const APP_NAME = "ADT Studio"

/**
 * Set the document title for the current screen AND announce it to screen-reader
 * users on change.
 *
 * In a single-page app the document title never changes on its own, so without
 * this every route is announced as the same generic "ADT Studio" (WCAG 2.4.2
 * Page Titled) and screen-reader users get no signal that the view changed when
 * they navigate (e.g. between pipeline stages).
 */
export function usePageTitle(
  title: string,
  options?: {
    /**
     * Announce the title to screen readers on change. Default true. Set false
     * on screens that already move focus to a heading on navigation (e.g. the
     * wizard), so the title is not read twice.
     */
    announce?: boolean
  },
): void {
  const shouldAnnounce = options?.announce ?? true
  const { announce } = useAnnouncer()
  useEffect(() => {
    const workspace = import.meta.env.VITE_WORKSPACE_NAME
    const base = workspace ? `${APP_NAME} — ${workspace}` : APP_NAME
    document.title = title ? `${title} · ${base}` : base
    if (title && shouldAnnounce) announce(title)
  }, [title, announce, shouldAnnounce])
}
