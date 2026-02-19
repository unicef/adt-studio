import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import yaml from "js-yaml"

export function createSpeechConfigRoutes(configPath: string): Hono {
  const app = new Hono()
  const configDir = path.join(path.dirname(configPath), "config")

  // GET /speech-config/instructions — read speech_instructions.yaml
  app.get("/speech-config/instructions", (c) => {
    const filePath = path.join(configDir, "speech_instructions.yaml")
    if (!fs.existsSync(filePath)) {
      return c.json({})
    }
    const content = fs.readFileSync(filePath, "utf-8")
    const parsed = yaml.load(content) as Record<string, string> | null
    return c.json(parsed ?? {})
  })

  // PUT /speech-config/instructions — write speech_instructions.yaml
  app.put("/speech-config/instructions", async (c) => {
    const body = await c.req.json<Record<string, string>>()
    const filePath = path.join(configDir, "speech_instructions.yaml")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, yaml.dump(body, { lineWidth: -1 }), "utf-8")
    return c.json(body)
  })

  // GET /speech-config/voices — read voices.yaml
  app.get("/speech-config/voices", (c) => {
    const filePath = path.join(configDir, "voices.yaml")
    if (!fs.existsSync(filePath)) {
      return c.json({})
    }
    const content = fs.readFileSync(filePath, "utf-8")
    const parsed = yaml.load(content) as Record<string, Record<string, string>> | null
    return c.json(parsed ?? {})
  })

  // PUT /speech-config/voices — write voices.yaml
  app.put("/speech-config/voices", async (c) => {
    const body = await c.req.json<Record<string, Record<string, string>>>()
    const filePath = path.join(configDir, "voices.yaml")
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(filePath, yaml.dump(body, { lineWidth: -1 }), "utf-8")
    return c.json(body)
  })

  return app
}
