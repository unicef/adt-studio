import { createFileRoute } from "@tanstack/react-router"
import { readBookImage } from "../server/conversions"
import { fileResponse, handled, requireParams } from "../server/responses"

export const Route = createFileRoute("/page-image")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const params = requireParams(request, ["booksDir", "name", "image"])
        if (params instanceof Response) return params
        return handled(async () => fileResponse(await readBookImage(params.booksDir, params.name, params.image), "No image"))
      },
    },
  },
})
