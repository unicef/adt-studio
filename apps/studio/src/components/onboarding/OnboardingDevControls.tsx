/* eslint-disable lingui/no-unlocalized-strings -- dev-only preview controls, never shipped in production */
import { useState } from "react"
import { Sun, Moon, Package, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { NO_DRAG_REGION } from "@/constants"
import { OB_CHANNEL } from "./theme"

/**
 * Dev-only floating switcher to preview the onboarding across theme (light/dark)
 * and release channel (stable/beta). Theme toggles the app `.dark` class live;
 * channel reloads with `?channel=` since it's resolved at module load. Rendered
 * only under `import.meta.env.DEV`.
 */
export function OnboardingDevControls() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )

  const setTheme = (next: boolean) => {
    document.documentElement.classList.toggle("dark", next)
    setDark(next)
  }

  const setChannel = (next: "stable" | "beta") => {
    if (next === OB_CHANNEL) return
    const url = new URL(window.location.href)
    url.searchParams.set("channel", next)
    window.location.href = url.toString()
  }

  const seg = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
      active
        ? "bg-[var(--ob-accent)] text-white shadow-sm"
        : "text-[var(--ob-muted)] hover:text-[var(--ob-fg)]",
    )

  return (
    <div
      style={NO_DRAG_REGION}
      className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-surface)]/90 p-1.5 shadow-[0_10px_30px_-12px_rgba(20,32,80,0.4)] backdrop-blur"
    >
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => setTheme(false)} className={seg(!dark)}>
          <Sun className="h-3.5 w-3.5" strokeWidth={2.2} />
          Light
        </button>
        <button type="button" onClick={() => setTheme(true)} className={seg(dark)}>
          <Moon className="h-3.5 w-3.5" strokeWidth={2.2} />
          Dark
        </button>
      </div>
      <span className="h-4 w-px bg-[var(--ob-border)]" />
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setChannel("stable")}
          className={seg(OB_CHANNEL === "stable")}
        >
          <Package className="h-3.5 w-3.5" strokeWidth={2.2} />
          Stable
        </button>
        <button
          type="button"
          onClick={() => setChannel("beta")}
          className={seg(OB_CHANNEL === "beta")}
        >
          <FlaskConical className="h-3.5 w-3.5" strokeWidth={2.2} />
          Beta
        </button>
      </div>
    </div>
  )
}
