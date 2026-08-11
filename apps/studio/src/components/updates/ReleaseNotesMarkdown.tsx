import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { RELEASE_BANNER_ASPECT, trustedAssetUrl } from "./release-banner-utils"

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
  const blocks = looksLikeHtml(children)
    ? parseHtmlBlocks(children)
    : parseBlocks(children)

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
              className={cn(
                "w-full rounded-lg border bg-muted/30 object-cover",
                RELEASE_BANNER_ASPECT,
              )}
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
      const src = trustedAssetUrl(image[2])
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

const HTML_BLOCK_TAGS =
  /<(?:h[1-6]|ul|ol|li|p|a|blockquote|pre|table|div|hr|strong|em|code|span)\b/i

function looksLikeHtml(value: string): boolean {
  return HTML_BLOCK_TAGS.test(value)
}

function parseHtmlBlocks(html: string): Block[] {
  if (typeof DOMParser === "undefined") {
    return parseBlocks(html.replace(/<[^>]+>/g, " "))
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  const blocks: Block[] = []
  collectHtmlBlocks(doc.body, blocks)
  return blocks
}

function collectHtmlBlocks(root: ParentNode, blocks: Block[]): void {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = collapse(node.textContent ?? "")
      if (text) blocks.push({ type: "paragraph", text })
      continue
    }

    if (!(node instanceof Element)) continue
    const tag = node.tagName.toLowerCase()

    if (/^h[1-6]$/.test(tag)) {
      const text = htmlInlineToText(node)
      if (text) blocks.push({ type: "heading", text })
      continue
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((li) => htmlInlineToText(li))
        .filter(Boolean)
      if (items.length) blocks.push({ type: "list", items })
      continue
    }

    if (tag === "img" || tag === "picture") {
      const src = htmlImageSrc(node)
      if (src) blocks.push({ type: "image", src, alt: htmlImageAlt(node) })
      continue
    }

    if (tag === "hr") {
      blocks.push({ type: "rule" })
      continue
    }

    if (tag === "p" || tag === "blockquote") {
      const image = node.querySelector("img")
      const src = image ? htmlImageSrc(image) : undefined
      if (src) blocks.push({ type: "image", src, alt: htmlImageAlt(image!) })
      const text = htmlInlineToText(node)
      if (text) blocks.push({ type: "paragraph", text })
      continue
    }

    collectHtmlBlocks(node, blocks)
  }
}

function htmlInlineToText(root: Node): string {
  let out = ""
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ""
      continue
    }
    if (!(node instanceof Element)) continue
    const tag = node.tagName.toLowerCase()
    if (tag === "br") {
      out += " "
      continue
    }
    if (tag === "img") continue
    if (tag === "a") {
      const href = node.getAttribute("href") ?? ""
      const label = htmlInlineToText(node)
      out += /^https?:\/\//i.test(href) && label ? `[${label}](${href})` : label
      continue
    }
    out += htmlInlineToText(node)
  }
  return collapse(out)
}

function htmlImageSrc(node: Element): string | undefined {
  if (node.tagName.toLowerCase() === "img") {
    return trustedAssetUrl(node.getAttribute("src") ?? undefined)
  }
  const source = node.querySelector("source[srcset]")
  const fromSource = source?.getAttribute("srcset")?.trim().split(/\s+/)[0]
  const img = node.querySelector("img")
  return trustedAssetUrl(fromSource ?? img?.getAttribute("src") ?? undefined)
}

function htmlImageAlt(node: Element): string {
  const img = node.tagName.toLowerCase() === "img" ? node : node.querySelector("img")
  return img?.getAttribute("alt") ?? ""
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim()
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
    const label = compactLinkLabel(match[1], href)
    nodes.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          window.open(href, "_blank", "noopener,noreferrer")
        }}
        className="break-words rounded-sm font-medium text-primary underline decoration-primary/30 underline-offset-2 outline-none hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </a>,
    )
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function compactLinkLabel(label: string | undefined, href: string): string {
  if (label) return label

  const pullRequest = href.match(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/([1-9]\d*)\/?$/,
  )
  if (pullRequest) return `#${pullRequest[1]}`

  const comparison = href.match(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/compare\/([^/?#]+)\.\.\.([^/?#]+)\/?$/,
  )
  if (comparison) {
    return `${decodeURIComponent(comparison[1])}…${decodeURIComponent(comparison[2])}`
  }

  return href
}
