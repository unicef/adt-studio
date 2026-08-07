import fs from "node:fs"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import yaml from "js-yaml"
import {
  AppConfig,
  BookLabel,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  DefaultModelConfig,
  SpecializedModelDefaultsConfig,
  StyleguideName,
} from "@adt/types"
import {
  getStyleguideSearchDirs,
  getWritableStyleguidesDir,
  resolveStyleguideSource,
  StyleguideWriteError,
  writeStyleguideFiles,
} from "../services/styleguide.js"

function setTopLevelYamlValue(
  content: string,
  key: string,
  value: string,
): string {
  const line = `${key}: ${JSON.stringify(value)}`
  const matcher = new RegExp(`^${key}:\\s*.*$`, "m")
  return matcher.test(content)
    ? content.replace(matcher, line)
    : `${line}\n${content}`
}

function optionalBookLabel(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const parsed = BookLabel.safeParse(value)
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid book label" })
  }
  return parsed.data
}

function throwStyleguideWriteError(error: unknown): never {
  if (error instanceof StyleguideWriteError) {
    throw new HTTPException(500, { message: error.message })
  }
  throw error
}

export function createPresetRoutes(configPath: string, booksDir: string): Hono {
  const app = new Hono()

  app.get("/styleguides", (c) => {
    const bookLabel = optionalBookLabel(c.req.query("book"))
    const names = new Set<string>()
    for (const { dir } of getStyleguideSearchDirs(configPath, booksDir, bookLabel)) {
      if (!fs.existsSync(dir)) continue
      for (const filename of fs.readdirSync(dir)) {
        if (!filename.endsWith(".md")) continue
        const name = filename.replace(/\.md$/, "")
        if (StyleguideName.safeParse(name).success) names.add(name)
      }
    }
    return c.json({ styleguides: [...names].sort() })
  })

  app.get("/styleguides/:name/preview", (c) => {
    const parsed = StyleguideName.safeParse(c.req.param("name"))
    if (!parsed.success) {
      throw new HTTPException(400, { message: "Invalid styleguide name" })
    }
    const name = parsed.data
    const source = resolveStyleguideSource(
      name,
      configPath,
      booksDir,
      optionalBookLabel(c.req.query("book")),
    )
    if (!source) {
      throw new HTTPException(404, { message: `Styleguide not found: ${name}` })
    }
    if (source.previewPath) {
      return c.json({ name, html: fs.readFileSync(source.previewPath, "utf-8") })
    }

    const md = fs.readFileSync(source.markdownPath, "utf-8")
    const escapedMd = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    const codeBlocks: string[] = []
    const withPlaceholders = escapedMd.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_match, _lang, code) => {
        const idx = codeBlocks.length
        codeBlocks.push(`<pre style="background:#f3f4f6;border-radius:0.5rem;padding:1rem;overflow-x:auto;font-size:0.8rem;line-height:1.5;margin:0.75rem 0;"><code>${code}</code></pre>`)
        return `\x00CODEBLOCK${idx}\x00`
      },
    )
    const bodyHtml = withPlaceholders
      .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1rem;font-weight:700;margin:1.5rem 0 0.5rem;">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:1.3rem;font-weight:700;margin:2rem 0 0.75rem;border-bottom:1px solid #e5e7eb;padding-bottom:0.5rem;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:1.6rem;font-weight:800;margin:0 0 1rem;">$1</h1>')
      .replace(/\n\n/g, '</p><p style="margin:0.5rem 0;line-height:1.6;">')
      .replace(/\x00CODEBLOCK(\d+)\x00/g, (_match, idx) => codeBlocks[Number(idx)])
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Styleguide — ${name}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:56rem;margin:0 auto;padding:2rem;color:#1f2937;font-size:0.95rem;}
table{border-collapse:collapse;width:100%;margin:0.75rem 0;}th,td{border:1px solid #e5e7eb;padding:0.4rem 0.75rem;text-align:left;font-size:0.85rem;}th{background:#f9fafb;font-weight:600;}</style>
</head><body><p style="margin:0.5rem 0;line-height:1.6;">${bodyHtml}</p></body></html>`
    return c.json({ name, html })
  })

  app.post("/styleguides/upload", async (c) => {
    const body = await c.req.parseBody()
    const file = body["file"]
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "Missing file" })
    }
    if (!file.name.endsWith(".md")) {
      throw new HTTPException(400, { message: "Only .md files are accepted" })
    }
    const parsed = StyleguideName.safeParse(file.name.replace(/\.md$/, ""))
    if (!parsed.success) {
      throw new HTTPException(400, { message: "Invalid styleguide name" })
    }
    try {
      writeStyleguideFiles({
        dir: getWritableStyleguidesDir(booksDir),
        name: parsed.data,
        content: await file.text(),
      })
    } catch (error) {
      throwStyleguideWriteError(error)
    }
    return c.json({ name: parsed.data })
  })

  app.get("/config", (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    return c.json({ config: parsed })
  })

  // Return the global fallback text-generation model.
  app.get("/config/default-model", (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = AppConfig.parse(yaml.load(content))
    return c.json({ model: parsed.default_model ?? DEFAULT_LLM_MODEL_ID })
  })

  // Update only the fallback model while preserving config.yaml formatting.
  app.put("/config/default-model", async (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const result = DefaultModelConfig.safeParse(await c.req.json())
    if (!result.success) {
      throw new HTTPException(400, { message: "Invalid default model id" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    AppConfig.parse({ ...parsed, default_model: result.data.model })

    const updated = setTopLevelYamlValue(
      content,
      "default_model",
      result.data.model,
    )
    fs.writeFileSync(configPath, updated, "utf-8")

    return c.json(result.data)
  })

  // Return the global defaults used by image and OpenAI speech generation.
  app.get("/config/specialized-model-defaults", (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = AppConfig.parse(yaml.load(content))
    return c.json({
      imageGeneration:
        parsed.default_image_generation_model ??
        DEFAULT_IMAGE_GENERATION_MODEL_ID,
      speechGeneration:
        parsed.default_speech_generation_model ??
        DEFAULT_OPENAI_TTS_MODEL_ID,
    })
  })

  // Update only specialized defaults while preserving the rest of config.yaml.
  app.put("/config/specialized-model-defaults", async (c) => {
    if (!fs.existsSync(configPath)) {
      throw new HTTPException(404, { message: "Global config not found" })
    }

    const result = SpecializedModelDefaultsConfig.safeParse(await c.req.json())
    if (!result.success) {
      throw new HTTPException(400, {
        message: "Invalid specialized model defaults",
      })
    }

    const content = fs.readFileSync(configPath, "utf-8")
    const parsed = yaml.load(content) as Record<string, unknown>
    AppConfig.parse({
      ...parsed,
      default_image_generation_model: result.data.imageGeneration,
      default_speech_generation_model: result.data.speechGeneration,
    })

    const withImageModel = setTopLevelYamlValue(
      content,
      "default_image_generation_model",
      result.data.imageGeneration,
    )
    const updated = setTopLevelYamlValue(
      withImageModel,
      "default_speech_generation_model",
      result.data.speechGeneration,
    )
    fs.writeFileSync(configPath, updated, "utf-8")

    return c.json(result.data)
  })

  return app
}
