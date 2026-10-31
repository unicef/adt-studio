import { createFileRoute } from "@tanstack/react-router"
import { PublishAnimationDemo } from "@/components/pipeline/stages/publish/PublishAnimationDemo"

/** Temporary visual test bench for the publishing step artwork. */
export const Route = createFileRoute("/dev/publish-loaders")({
  component: PublishAnimationDemo,
})
