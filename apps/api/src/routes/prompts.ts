import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"

export function createPromptRoutes(promptsDir: string) {
  const app = new Hono()

  // GET /prompts/:name — read prompt template content
  app.get("/prompts/:name", (c) => {
    const name = c.req.param("name")

    // Validate name: alphanumeric + underscores only (no path traversal)
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    const filePath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const content = fs.readFileSync(filePath, "utf-8")
    return c.json({ name, content })
  })

  return app
}
