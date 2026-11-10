import { useEffect } from "react"
import { useAtomValue } from "jotai"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { canSoftNavigate } from "@/features/navigation/lib/page-swap"

/**
 * Speeds up MPA navigation between book pages by hinting the browser to
 * prefetch (and prerender, where supported) adjacent pages.
 *
 *   - `<link rel="prefetch">` for prev + next: works everywhere; warms the
 *     HTTP cache so the next click only pays parse/render cost.
 *   - `<script type="speculationrules">` for next: Chrome/Edge prerender the
 *     full document in the background, so the click swaps an already-painted
 *     page in. Silently ignored in browsers without support. Only emitted on
 *     the hard-navigation path — an in-place swap never activates a
 *     prerendered document, so it would boot a second copy of the runtime
 *     (and fire a phantom analytics page view) for nothing.
 *
 * Mounted unconditionally — emits nothing while `pages` is empty.
 */
export function PagePrefetcher() {
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)

  useEffect(() => {
    if (pages.length === 0) return
    const idx = pages.findIndex((p) => p.section_id === currentSectionId)
    if (idx < 0) return
    const prev = idx > 0 ? pages[idx - 1] : undefined
    const next = idx < pages.length - 1 ? pages[idx + 1] : undefined

    const injected: Element[] = []

    for (const target of [prev, next]) {
      if (!target?.href) continue
      const link = document.createElement("link")
      link.rel = "prefetch"
      link.href = target.href
      document.head.appendChild(link)
      injected.push(link)
    }

    if (next?.href && !canSoftNavigate()) {
      const script = document.createElement("script")
      script.type = "speculationrules"
      script.textContent = JSON.stringify({
        prerender: [{ urls: [next.href] }],
      })
      document.head.appendChild(script)
      injected.push(script)
    }

    return () => {
      for (const el of injected) el.remove()
    }
  }, [pages, currentSectionId])

  return null
}
