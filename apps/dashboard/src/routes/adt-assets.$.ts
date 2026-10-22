import { createFileRoute } from "@tanstack/react-router"
import { readAdtAsset } from "../server/pages"
import { fileResponse, handled } from "../server/responses"

export const Route = createFileRoute("/adt-assets/$")({
  server: {
    handlers: {
      GET: ({ params }) => handled(async () => fileResponse(await readAdtAsset(params._splat ?? ""), "No asset")),
    },
  },
})
