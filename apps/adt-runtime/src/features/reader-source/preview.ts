export const RELOAD_STYLES_MESSAGE = "adt-studio/reload-styles"
export const RUNTIME_ERROR_MESSAGE = "adt-runtime/error"

export interface ComponentSource {
  path: string
  line: number
}

declare global {
  var __adtSources: Record<string, ComponentSource> | undefined
}

export function sourceOfComponentStack(componentStack: string | null | undefined): ({ component: string } & ComponentSource) | null {
  const index = globalThis.__adtSources ?? {}
  for (const match of (componentStack ?? "").matchAll(/at (\w+)|^\s*(\w+)@/gm)) {
    const component = match[1] ?? match[2]
    const source = component ? index[component] : undefined
    if (component && source) return { component, ...source }
  }
  return null
}

export function reportRuntimeError(error: unknown, componentStack: string | null | undefined): void {
  if (typeof window === "undefined" || window.parent === window) return
  const source = sourceOfComponentStack(componentStack)
  window.parent.postMessage(
    {
      type: RUNTIME_ERROR_MESSAGE,
      message: error instanceof Error ? error.message : String(error),
      path: source?.path ?? null,
      line: source?.line ?? null,
      component: source?.component ?? null,
    },
    "*",
  )
}

export function reloadStylesheets(doc: Document = document): number {
  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="tailwind_output.css"]')]
  for (const link of links) {
    const url = new URL(link.href, doc.baseURI)
    url.searchParams.set("v", String(Date.now()))
    link.href = url.toString()
  }
  return links.length
}

export function subscribeReaderSourcePreview(): () => void {
  if (typeof window === "undefined" || window.parent === window) return () => {}
  const handler = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    if ((event.data as { type?: unknown } | null)?.type === RELOAD_STYLES_MESSAGE) reloadStylesheets()
  }
  window.addEventListener("message", handler)
  return () => window.removeEventListener("message", handler)
}
