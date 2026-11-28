export type BookConfig = Record<string, unknown>

export function readPath(config: BookConfig, path: string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node && typeof node === "object" ? (node as BookConfig)[key] : undefined),
    config,
  )
}

export function writePath(config: BookConfig, path: string[], value: string | null): void {
  const [key, ...rest] = path
  if (rest.length === 0) {
    if (value) config[key] = value
    else delete config[key]
    return
  }
  const child = config[key]
  const node: BookConfig = child && typeof child === "object" && !Array.isArray(child) ? { ...(child as BookConfig) } : {}
  writePath(node, rest, value)
  if (Object.keys(node).length > 0) config[key] = node
  else delete config[key]
}
