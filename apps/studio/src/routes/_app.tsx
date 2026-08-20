import { createFileRoute, redirect } from "@tanstack/react-router"
import { AppLayout } from "@/components/app/AppLayout"
import { hasCompletedOnboarding } from "@/hooks/use-onboarding"
import { isElectron } from "@/lib/utils"

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (typeof window === "undefined") return
    if (isElectron() && !hasCompletedOnboarding()) {
      throw redirect({ to: "/onboarding" })
    }
  },
  component: AppLayout,
})
