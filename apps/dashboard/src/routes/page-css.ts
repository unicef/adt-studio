import { createFileRoute } from "@tanstack/react-router"
import { pageCss } from "../server/pages"
import { handled, requireParams, textResponse } from "../server/responses"

export const Route = createFileRoute("/page-css")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const params = requireParams(request, ["booksDir", "name"])
        if (params instanceof Response) return params
        return handled(async () => textResponse(await pageCss(params.booksDir, params.name), "text/css"))
      },
    },
  },
})
