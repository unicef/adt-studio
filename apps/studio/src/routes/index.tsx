import { createFileRoute, redirect } from "@tanstack/react-router"
import { hasCompletedOnboarding } from "@/hooks/use-onboarding"
import { isElectron } from "@/lib/utils"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return
    if (isElectron() && !hasCompletedOnboarding()) {
      throw redirect({ to: "/onboarding" })
    }
    throw redirect({ to: "/redesign", replace: true })
  },
  component: () => null,
})
