import { createFileRoute } from "@tanstack/react-router"
import { readCover } from "../server/conversions"

export const Route = createFileRoute("/cover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const booksDir = params.get("booksDir")
        const name = params.get("name")
        if (!booksDir || !name) return new Response("booksDir and name are required", { status: 400 })
        try {
          const cover = await readCover(booksDir, name)
          if (!cover) return new Response("No cover", { status: 404 })
          return new Response(new Uint8Array(cover.bytes), {
            headers: { "Content-Type": cover.type, "Cache-Control": "private, max-age=86400" },
          })
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), { status: 400 })
        }
      },
    },
  },
})
