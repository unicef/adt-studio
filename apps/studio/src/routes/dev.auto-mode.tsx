import { createFileRoute } from "@tanstack/react-router"
import { AutoModeDemo } from "@/components/wizard/auto/demo/AutoModeDemo"

/** Dev bench: runs the auto mode engine on a PDF and shows every step, to walk developers through it. */
export const Route = createFileRoute("/dev/auto-mode")({
  component: AutoModeDemo,
})
