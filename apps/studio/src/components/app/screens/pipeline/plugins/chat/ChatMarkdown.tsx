import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ChatMarkdownProps {
  children: string
  className?: string
}

type Block =
  | { type: "heading"; level: 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; code: string }

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g

/**
 * Deliberately small: the assistant is instructed to answer in short prose and
 * lists, and a streaming renderer has to tolerate half-finished syntax on every
 * frame. Unclosed fences render as plain text rather than swallowing the reply.
 */
export function ChatMarkdown({ children, className }: ChatMarkdownProps) {
  return (
    <div className={cn("flex flex-col gap-2 text-[12.5px] leading-relaxed", className)}>
      {parseBlocks(children).map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 3 ? "h3" : "h4"
          return (
            <Tag key={index} className="text-pretty font-semibold text-foreground">
              {renderInline(block.text)}
            </Tag>
          )
        }

        if (block.type === "code") {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg bg-muted px-2.5 py-2 font-mono text-[11.5px] leading-[1.5]"
            >
              <code>{block.code}</code>
            </pre>
          )
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul"
          return (
            <Tag
              key={index}
              className={cn(
                "flex flex-col gap-1 pl-4.5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="text-pretty">
                  {renderInline(item)}
                </li>
              ))}
            </Tag>
          )
        }

        return (
          <p key={index} className="text-pretty">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let ordered = false
  let fence: string[] | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ type: "paragraph", text: paragraph.join(" ") })
    paragraph = []
  }

  const flushList = () => {
    if (list.length === 0) return
    blocks.push({ type: "list", ordered, items: list })
    list = []
  }

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (fence === null) {
        flushParagraph()
        flushList()
        fence = []
      } else {
        blocks.push({ type: "code", code: fence.join("\n") })
        fence = null
      }
      continue
    }

    if (fence !== null) {
      fence.push(line)
      continue
    }

    const trimmed = line.trim()

    if (trimmed === "") {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        type: "heading",
        level: heading[1].length <= 2 ? 3 : 4,
        text: heading[2],
      })
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      flushParagraph()
      const nextOrdered = Boolean(numbered)
      if (list.length > 0 && nextOrdered !== ordered) flushList()
      ordered = nextOrdered
      list.push((bullet?.[1] ?? numbered?.[1]) as string)
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  if (fence !== null) paragraph.push(...fence)
  flushParagraph()
  flushList()
  return blocks
}

function renderInline(text: string): ReactNode {
  return text.split(INLINE_PATTERN).map((token, index) => {
    if (!token) return null
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11.5px]"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={index} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      )
    }
    if (
      ((token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))) &&
      token.length > 2
    ) {
      return <em key={index}>{token.slice(1, -1)}</em>
    }
    return <Fragment key={index}>{token}</Fragment>
  })
}
