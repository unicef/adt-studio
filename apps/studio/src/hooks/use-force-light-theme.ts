import { useEffect } from "react"

/**
 * Renders the current screen in the light palette regardless of the app theme.
 *
 * TEMPORARY. The pipeline was built against light-mode colours only — roughly
 * 700 hardcoded values across a hundred files — so on a dark theme it shows
 * black text on black panels. Rather than churn those files while the pipeline
 * refactor is in flight, we drop the `dark` class for as long as a pipeline
 * route is mounted and put it back on the way out.
 *
 * Dropping the class (rather than re-declaring the tokens on a wrapper) also
 * covers dialogs, tooltips and toasts, which portal to document.body and would
 * otherwise stay dark over a light pipeline.
 *
 * Remove this hook, and its call in routes/books.$label.tsx, once the pipeline
 * is themed.
 */
export function useForceLightTheme(): void {
  useEffect(() => {
    const root = document.documentElement
    if (!root.classList.contains("dark")) return
    root.classList.remove("dark")
    return () => root.classList.add("dark")
  }, [])
}
