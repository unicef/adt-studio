import { createFileRoute } from "@tanstack/react-router"
import { readCover } from "../server/conversions"
import { fileResponse, handled, requireParams } from "../server/responses"

export const Route = createFileRoute("/cover")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const params = requireParams(request, ["booksDir", "name"])
        if (params instanceof Response) return params
        return handled(async () => fileResponse(await readCover(params.booksDir, params.name), "No cover"))
      },
    },
  },
})
