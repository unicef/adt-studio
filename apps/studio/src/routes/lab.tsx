import { createFileRoute, redirect } from "@tanstack/react-router"
import { LAB_ENABLED } from "@/components/app/lab/variants"
import { TestPlanScreen } from "@/components/app/lab/testPlan/TestPlanScreen"

export const Route = createFileRoute("/lab")({
  beforeLoad: () => {
    if (!LAB_ENABLED) throw redirect({ to: "/" })
  },
  component: TestPlanScreen,
})
