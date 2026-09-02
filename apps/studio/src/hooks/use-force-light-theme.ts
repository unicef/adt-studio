import { useEffect } from "react"
import { applyStoredTheme, setThemeSuspended } from "@/lib/theme"

/**
 * Renders the current screen in the light palette regardless of the app theme.
 *
 * TEMPORARY. The pipeline was built against light-mode colours only — roughly
 * 700 hardcoded values across a hundred files — so on a dark theme it shows
 * black text on black panels. Rather than churn those files while the pipeline
 * refactor is in flight, the pipeline opts out of the theme while it is open.
 *
 * Dropping the `dark` class (rather than re-declaring tokens on a wrapper) also
 * covers dialogs, tooltips and toasts, which portal to document.body and would
 * otherwise stay dark over a light pipeline. Painting is suspended for the same
 * reason: an OS colour-scheme change must not repaint the document underneath.
 *
 * On the way out the user's stored preference is re-applied — not simply the
 * class that was there before — so a preference changed meanwhile still wins.
 *
 * Remove this hook, and its call in routes/books.$label.tsx, once the pipeline
 * is themed.
 */
export function useForceLightTheme(): void {
  useEffect(() => {
    setThemeSuspended(true)
    const root = document.documentElement
    const wasDark = root.classList.contains("dark")
    root.classList.remove("dark")

    return () => {
      setThemeSuspended(false)
      if (wasDark) applyStoredTheme()
    }
  }, [])
}
