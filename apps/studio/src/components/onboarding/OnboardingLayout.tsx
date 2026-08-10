import { useEffect, useState, type ReactNode } from "react"
import { cn, isElectron } from "@/lib/utils"
import { onboardingThemeVars } from "./theme"
import { OnboardingDevControls } from "./OnboardingDevControls"

/**
 * Full-window shell for the first-run onboarding. In the desktop build this
 * renders inside a small, fixed-size, transparent, frameless window, so the
 * card fills the window and its rounded corners reveal the desktop behind it.
 * On the web build the same card is centered on a soft wash. The card fades and
 * scales in on mount.
 */
export function OnboardingLayout({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const inElectron = isElectron()

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // The onboarding is a full-window, light-only branded surface. Neutralize the
  // app's dark theme while it's mounted so shared token-based components (locale
  // switcher, buttons) don't half-flip on the white card. Restored on exit.
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains("dark")
    if (wasDark) root.classList.remove("dark")
    return () => {
      if (wasDark) root.classList.add("dark")
    }
  }, [])

  useEffect(() => {
    if (!inElectron) return
    const targets = [
      document.documentElement,
      document.body,
      document.getElementById("root"),
    ].filter((el): el is HTMLElement => el != null)
    const previous = targets.map((el) => el.style.backgroundColor)
    targets.forEach((el) => {
      el.style.backgroundColor = "transparent"
    })
    return () => {
      targets.forEach((el, i) => {
        el.style.backgroundColor = previous[i]
      })
    }
  }, [inElectron])

  return (
    <div
      style={onboardingThemeVars}
      className={cn(
        "fixed inset-0 flex items-center justify-center overflow-hidden",
        inElectron
          ? "bg-transparent p-0"
          : "bg-[radial-gradient(120%_120%_at_50%_-10%,var(--ob-accent-wash)_0%,#eef0f5_55%,#e7e9ef_100%)] p-6",
      )}
    >
      <div
        className={cn(
          "relative flex h-full w-full max-h-[620px] max-w-[900px] flex-col overflow-hidden text-[#0a0a0a]",
          "rounded-[18px] border border-black/[0.08] bg-white",
          "shadow-[0_40px_120px_-24px_rgba(20,32,80,0.45)]",
          "transition-all duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0",
        )}
      >
        {children}
      </div>
      {import.meta.env.DEV && <OnboardingDevControls />}
    </div>
  )
}

export function OnboardingStepContainer({
  children,
  animationClass,
  stepKey,
}: {
  children: ReactNode
  animationClass: string
  stepKey: string | number
}) {
  return (
    <div
      key={stepKey}
      className={cn("relative flex min-h-0 flex-1 items-stretch", animationClass)}
    >
      {children}
    </div>
  )
}
