import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"

const VALID_NAME = /^[a-zA-Z0-9_]+$/

export function createPromptRoutes(promptsDir: string, booksDir: string) {
  const app = new Hono()
  const templatesDir = path.join(path.dirname(promptsDir), "templates")

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

  // --- Render templates (Liquid layout templates used by template-based strategies) ---

  // GET /templates — list available template names
  app.get("/templates", (c) => {
    if (!fs.existsSync(templatesDir)) {
      return c.json({ templates: [] })
    }
    const files = fs.readdirSync(templatesDir)
    const names = files
      .filter((f) => f.endsWith(".liquid"))
      .map((f) => f.replace(/\.liquid$/, ""))
    return c.json({ templates: names })
  })

  // GET /templates/:name — read global template
  app.get("/templates/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const filePath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    const content = fs.readFileSync(filePath, "utf-8")
    return c.json({ name, content })
  })

  // PUT /templates/:name — update global template
  app.put("/templates/:name", async (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const filePath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    fs.writeFileSync(filePath, body.content, "utf-8")
    return c.json({ name, content: body.content })
  })

  // GET /books/:label/templates/:name — read book override, fall back to global
  app.get("/books/:label/templates/:name", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const bookPath = path.join(booksDir, label, "templates", `${name}.liquid`)
    if (fs.existsSync(bookPath)) {
      const content = fs.readFileSync(bookPath, "utf-8")
      return c.json({ name, content, source: "book" })
    }

    const globalPath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    const content = fs.readFileSync(globalPath, "utf-8")
    return c.json({ name, content, source: "global" })
  })

  // PUT /books/:label/templates/:name — save book-level template override
  app.put("/books/:label/templates/:name", async (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const globalPath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    const bookTemplatesDir = path.join(booksDir, label, "templates")
    fs.mkdirSync(bookTemplatesDir, { recursive: true })
    const bookPath = path.join(bookTemplatesDir, `${name}.liquid`)
    fs.writeFileSync(bookPath, body.content, "utf-8")
    return c.json({ name, content: body.content, source: "book" })
  })

  return app
}
