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
  | { type: "image"; src: string; darkSrc?: string; alt: string }
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
            <div
              key={index}
              className={cn(
                "relative w-full overflow-hidden rounded-lg border bg-muted/30",
                RELEASE_BANNER_ASPECT,
              )}
            >
              <img
                src={block.src}
                alt={block.alt}
                loading="lazy"
                className={cn(
                  "size-full object-contain",
                  block.darkSrc && "dark:hidden",
                )}
              />
              {block.darkSrc && (
                <img
                  src={block.darkSrc}
                  alt={block.alt}
                  loading="lazy"
                  className="hidden size-full object-contain dark:block"
                />
              )}
            </div>
          )
        }

        return <hr key={index} className="border-border" />
      })}
    </div>
  )
}

function parseBlocks(markdown: string): Block[] {
  const normalized = normalizeImages(markdown)
  const lines = normalized.markdown.split(/\r?\n/)
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

    const picture = line.match(/^@@adt-release-picture:(\d+)@@$/)
    if (picture) {
      flushParagraph()
      flushList()
      const image = normalized.pictures[Number(picture[1])]
      if (image) blocks.push(image)
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

function normalizeImages(markdown: string): {
  markdown: string
  pictures: Extract<Block, { type: "image" }>[]
} {
  const pictures: Extract<Block, { type: "image" }>[] = []
  const normalized = markdown
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .replace(/<picture[\s\S]*?<\/picture>/gi, (match) => {
      const picture = htmlPicture(match)
      if (!picture) return "\n"
      const index = pictures.push(picture) - 1
      return `\n@@adt-release-picture:${index}@@\n`
    })
    .replace(/<img[^>]*>/gi, (match) => {
      const src = firstHtmlImage(match)
      return src ? `\n![](${src})\n` : "\n"
    })
  return { markdown: normalized, pictures }
}

function htmlPicture(
  html: string,
): Extract<Block, { type: "image" }> | undefined {
  const sources = html.match(/<source\b[^>]*>/gi) ?? []
  const image = html.match(/<img\b[^>]*>/i)?.[0] ?? ""
  const lightSource = sources.find((source) =>
    attribute(source, "media")?.includes("prefers-color-scheme: light"),
  )
  const darkSource = sources.find((source) =>
    attribute(source, "media")?.includes("prefers-color-scheme: dark"),
  )
  const src = trustedAssetUrl(
    attribute(lightSource ?? "", "srcset") ?? attribute(image, "src"),
  )
  if (!src) return undefined
  return {
    type: "image",
    src,
    darkSrc: trustedAssetUrl(attribute(darkSource ?? "", "srcset")),
    alt: decodeHtmlAttribute(attribute(image, "alt")) ?? "",
  }
}

function firstHtmlImage(html: string): string | undefined {
  const source = html.match(/<source[^>]*\ssrcset=["']([^"']+)["'][^>]*>/i)
  if (source) return source[1].split(/\s+/)[0]
  const img = html.match(/<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/i)
  return img?.[1]
}

/* eslint-disable lingui/no-unlocalized-strings -- HTML attribute syntax and entity names are parser tokens, not UI copy. */
function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i"))?.[2]
}

function decodeHtmlAttribute(value?: string): string | undefined {
  return value
    ?.replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}
/* eslint-enable lingui/no-unlocalized-strings */

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
