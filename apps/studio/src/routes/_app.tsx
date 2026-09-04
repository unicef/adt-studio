import { createFileRoute, redirect } from "@tanstack/react-router"
import { AppLayout } from "@/components/app/AppLayout"
import { resolveOnboardingCompleted } from "@/hooks/use-onboarding"
import { isElectron } from "@/lib/utils"

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return
    if (!isElectron()) return
    if (await resolveOnboardingCompleted()) return
    throw redirect({ to: "/onboarding" })
  },
  component: AppLayout,
})
