import { useEffect, useState, type ReactNode } from "react"
import { cn, isElectron } from "@/lib/utils"

/**
 * Full-window shell for the first-run onboarding. In the desktop build this
 * renders inside a small, fixed-size, transparent, frameless window, so the
 * card fills the window and its rounded corners reveal the desktop behind it.
 * On the web build the same card is centered on a subtle wash. The card fades
 * and scales in on mount — the flow "starts with an animation".
 */
export function OnboardingLayout({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const inElectron = isElectron()

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
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
      className={cn(
        "fixed inset-0 flex items-center justify-center overflow-hidden",
        inElectron
          ? "bg-transparent p-0"
          : "bg-[radial-gradient(120%_120%_at_50%_-10%,#1b1030_0%,#0a0b12_55%,#07080d_100%)] p-6",
      )}
    >
      <div
        className={cn(
          "dark relative flex h-full w-full max-h-[620px] max-w-[900px] flex-col overflow-hidden text-zinc-100",
          "rounded-[18px] border border-white/10 bg-[#0b0d13]",
          "shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.02)_inset]",
          "transition-all duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(43,127,255,0.22),transparent_70%)]"
        />
        {children}
      </div>
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
      className={cn(
        "relative flex min-h-0 flex-1 items-center justify-center",
        animationClass,
      )}
    >
      {children}
    </div>
  )
}
