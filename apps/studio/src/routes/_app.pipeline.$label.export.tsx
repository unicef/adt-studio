import { createFileRoute, redirect } from "@tanstack/react-router"
import { openExportPopover } from "@/components/app/screens/pipeline/export/surfaces/exportPopover"

export const Route = createFileRoute("/_app/pipeline/$label/export")({
  beforeLoad: ({ params }) => {
    openExportPopover(params.label)
    throw redirect({ to: "/pipeline/$label", params: { label: params.label }, replace: true })
  },
})
