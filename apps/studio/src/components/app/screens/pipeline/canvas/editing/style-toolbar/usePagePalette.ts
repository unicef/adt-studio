import { useMemo } from "react"
import { usePage } from "@/hooks/use-pages"

const HEX_IN_HTML = /(?:text|bg|border)-\[(#[0-9a-fA-F]{3,6})\]|(?:color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,6})/g

function normalize(hex: string): string | null {
  const raw = hex.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw
  if (/^#[0-9a-f]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  return null
}

export function usePagePalette(label: string, pageId: string | null, limit = 6): string[] {
  const page = usePage(label, pageId ?? "")
  const detail = page.data
  return useMemo(() => {
    if (!detail) return []
    const counts = new Map<string, number>()
    const add = (hex: string | null | undefined, weight = 1) => {
      const value = hex ? normalize(hex) : null
      if (!value) return
      counts.set(value, (counts.get(value) ?? 0) + weight)
    }
    for (const section of detail.rendering?.sections ?? []) {
      for (const match of section.html.matchAll(HEX_IN_HTML)) add(match[1] ?? match[2], 2)
    }
    for (const section of detail.sectioningTree?.sections ?? []) {
      add(section.textColor)
      add(section.backgroundColor)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hex]) => hex)
      .slice(0, limit)
  }, [detail, limit])
}
