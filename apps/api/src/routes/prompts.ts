import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"

const VALID_NAME = /^[a-zA-Z0-9_]+$/

export function createPromptRoutes(promptsDir: string, booksDir: string) {
  const app = new Hono()

  // GET /prompts/:name — read global prompt template content
  app.get("/prompts/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    const filePath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const content = fs.readFileSync(filePath, "utf-8")
    return c.json({ name, content })
  })

  // PUT /prompts/:name — update global prompt template content
  app.put("/prompts/:name", async (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const filePath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    fs.writeFileSync(filePath, body.content, "utf-8")
    return c.json({ name, content: body.content })
  })

  // GET /books/:label/prompts/:name — read book override, fall back to global
  app.get("/books/:label/prompts/:name", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    // Check book-level override first
    const bookPath = path.join(booksDir, label, "prompts", `${name}.liquid`)
    if (fs.existsSync(bookPath)) {
      const content = fs.readFileSync(bookPath, "utf-8")
      return c.json({ name, content, source: "book" })
    }

    // Fall back to global
    const globalPath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const content = fs.readFileSync(globalPath, "utf-8")
    return c.json({ name, content, source: "global" })
  })

  // PUT /books/:label/prompts/:name — save book-level override
  app.put("/books/:label/prompts/:name", async (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    // Verify the prompt exists globally (so we don't create random files)
    const globalPath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    // Write book-level override
    const bookPromptsDir = path.join(booksDir, label, "prompts")
    fs.mkdirSync(bookPromptsDir, { recursive: true })
    const bookPath = path.join(bookPromptsDir, `${name}.liquid`)
    fs.writeFileSync(bookPath, body.content, "utf-8")
    return c.json({ name, content: body.content, source: "book" })
  })

  return app
}
