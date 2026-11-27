import { createFileRoute, redirect } from "@tanstack/react-router"
import { AutoModeDemo } from "@/components/wizard/auto/demo/AutoModeDemo"

/**
 * Dev bench: runs the auto mode engine on a PDF and shows every step, to walk developers through it.
 * Development builds only: the page is English-only and calls the engine with the user's AI service.
 */
export const Route = createFileRoute("/dev/auto-mode")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" })
  },
  component: AutoModeDemo,
})
