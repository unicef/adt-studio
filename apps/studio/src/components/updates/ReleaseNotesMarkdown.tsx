import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ReleaseNotesMarkdownProps {
  children: string
  className?: string
}

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" }

export function ReleaseNotesMarkdown({
  children,
  className,
}: ReleaseNotesMarkdownProps) {
  const blocks = parseBlocks(children)

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3 key={index} className="font-semibold text-foreground">
              {renderInline(block.text)}
            </h3>
          )
        }

        if (block.type === "paragraph") {
          return (
            <p key={index} className="text-muted-foreground">
              {renderInline(block.text)}
            </p>
          )
        }

        if (block.type === "list") {
          return (
            <ul
              key={index}
              className="list-disc space-y-1 pl-5 text-muted-foreground"
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }

        if (block.type === "image") {
          return (
            <img
              key={index}
              src={block.src}
              alt={block.alt}
              loading="lazy"
              className="max-w-full rounded-lg border"
            />
          )
        }

        return <hr key={index} className="border-border" />
      })}
    </div>
  )
}

function parseBlocks(markdown: string): Block[] {
  const lines = normalizeImages(markdown).split(/\r?\n/)
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ type: "paragraph", text: paragraph.join(" ") })
    paragraph = []
  }

  const flushList = () => {
    if (!list.length) return
    blocks.push({ type: "list", items: list })
    list = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/)
    if (image) {
      flushParagraph()
      flushList()
      const src = safeAssetUrl(image[2])
      if (src) blocks.push({ type: "image", alt: image[1], src })
      continue
    }

    if (/^---+$/.test(line)) {
      flushParagraph()
      flushList()
      blocks.push({ type: "rule" })
      continue
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: "heading", text: stripInlineMarkdown(heading[1]) })
      continue
    }

    const item = line.match(/^[-*]\s+(.+)$/)
    if (item) {
      flushParagraph()
      list.push(stripInlineMarkdown(item[1]))
      continue
    }

    flushList()
    paragraph.push(stripInlineMarkdown(line))
  }

  flushParagraph()
  flushList()
  return blocks
}

function normalizeImages(markdown: string): string {
  return markdown
    .replace(/<picture[\s\S]*?<\/picture>/gi, (match) => {
      const src = firstHtmlImage(match)
      return src ? `\n![](${src})\n` : "\n"
    })
    .replace(/<img[^>]*>/gi, (match) => {
      const src = firstHtmlImage(match)
      return src ? `\n![](${src})\n` : "\n"
    })
}

function firstHtmlImage(html: string): string | undefined {
  const source = html.match(/<source[^>]*\ssrcset=["']([^"']+)["'][^>]*>/i)
  if (source) return source[1].split(/\s+/)[0]
  const img = html.match(/<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/i)
  return img?.[1]
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim()
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/\S+)/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const href = match[2] ?? match[3]
    const label = match[1] ?? href
    nodes.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          window.open(href, "_blank", "noopener,noreferrer")
        }}
        className="font-medium text-primary underline underline-offset-2"
      >
        {label}
      </a>,
    )
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function safeAssetUrl(value: string): string | undefined {
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value
  return undefined
}
