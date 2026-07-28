/**
 * Global keyboard page navigation — listens for ArrowLeft / ArrowRight (and
 * PageUp / PageDown / Home / End) at document level and navigates between
 * pages from the `pagesAtom` manifest. Inputs, dock menu popovers, the
 * sidebar, and any open dialog suppress the shortcut so the surface in
 * focus owns its own arrow-key behavior.
 *
 * Direction follows reading order: ArrowRight / PageDown → next, ArrowLeft /
 * PageUp → previous. Home / End jump to the first / last page.
 *
 * WCAG: provides keyboard equivalents for the dock's prev/next buttons
 * (SC 2.1.1) without trapping focus (SC 2.1.2) — the listener is only
 * active outside text-input contexts and modal surfaces.
 */
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { appConfigAtom } from "@/shared/state/config.atoms"
import {
  currentSectionIdAtom,
  pagesAtom,
  type PageEntry,
} from "@/features/navigation/state/nav.atoms"
import { dockMenuValueAtom, sidebarOpenAtom } from "@/shared/state/ui.atoms"
import { isTypingTarget } from "@/features/navigation/lib/typing-target"
import { isAnyModalOpen } from "@/features/navigation/lib/modal-state"

function findIndex(pages: PageEntry[], sectionId: string | null): number {
  if (!sectionId) return -1
  return pages.findIndex((p) => p.section_id === sectionId)
}

export function useKeyboardPageNav(): void {
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const dockMenuValue = useAtomValue(dockMenuValueAtom)
  const setDockMenuValue = useSetAtom(dockMenuValueAtom)
  const sidebarOpen = useAtomValue(sidebarOpenAtom)
  const features = useAtomValue(appConfigAtom).features

  useEffect(() => {
    if (!features.showNavigationControls) return
    if (pages.length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      // The read-aloud (audio) panel is the one dock surface with no
      // arrow-key controls of its own, and users page through the book while
      // listening — so keep global page nav live while it's open. Every other
      // panel (toc/glossary/language/settings) owns its arrow keys.
      if (sidebarOpen) return
      if (dockMenuValue !== "" && dockMenuValue !== "audio") return
      if (isAnyModalOpen()) return

      const idx = findIndex(pages, currentSectionId)
      let target: PageEntry | undefined

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          if (idx >= 0 && idx < pages.length - 1) target = pages[idx + 1]
          break
        case "ArrowLeft":
        case "PageUp":
          if (idx > 0) target = pages[idx - 1]
          break
        case "Home":
          if (idx !== 0) target = pages[0]
          break
        case "End":
          if (idx !== pages.length - 1) target = pages[pages.length - 1]
          break
        default:
          return
      }

      if (!target) return
      event.preventDefault()
      // Turning the page dismisses the read-aloud panel. `dockMenuValue` is
      // persisted, so clearing it here keeps it closed on the next document
      // instead of re-opening. Playback itself resumes independently (the
      // persisted `isPlaying` flag), so audio keeps reading the new page.
      if (dockMenuValue === "audio") setDockMenuValue("")
      window.location.href = target.href
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [pages, currentSectionId, dockMenuValue, setDockMenuValue, sidebarOpen, features.showNavigationControls])
}
