import fs from "node:fs"
import path from "node:path"

export function loadStyleguideContent(
  styleguideName: string | undefined,
  configPath: string | undefined
): string | undefined {
  if (!styleguideName) return undefined
  const projectRoot = configPath ? path.dirname(configPath) : process.cwd()
  const styleguidesDir = path.resolve(projectRoot, "assets", "styleguides")
  const filePath = path.resolve(styleguidesDir, `${styleguideName}.md`)
  if (!filePath.startsWith(styleguidesDir + path.sep)) return undefined
  if (!fs.existsSync(filePath)) return undefined
  return fs.readFileSync(filePath, "utf-8")
}
