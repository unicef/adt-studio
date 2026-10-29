import { createFileRoute } from "@tanstack/react-router"
import { adtAssetsDir } from "../server/conversions"
import { renderPage } from "../server/pages"
import { handled, requireParams } from "../server/responses"

export const Route = createFileRoute("/page")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const params = requireParams(request, ["booksDir", "name", "page"])
        if (params instanceof Response) return params
        const book = { booksDir: params.booksDir, name: params.name, v: new URL(request.url).searchParams.get("v") ?? "0" }
        return handled(async () => {
          const html = await renderPage(params.booksDir, params.name, params.page, {
            css: `/page-css?${new URLSearchParams(book)}`,
            assets: adtAssetsDir() ? "/adt-assets" : null,
            image: (image) => `/page-image?${new URLSearchParams({ ...book, image })}`,
          })
          if (html === null) return new Response("This page was not rendered", { status: 404 })
          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": "script-src 'none'",
              "Cache-Control": "private, max-age=86400",
            },
          })
        })
      },
    },
  },
})
