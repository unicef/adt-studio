import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, X } from "lucide-react"
import type { AdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CopyTextButton } from "./CopyTextButton"

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "code"; text: string }
  | { kind: "paragraph"; text: string }

/** Just enough Markdown for the agent guide: headings, lists, tables, fenced
 * code and inline code. The guide is ADT Studio's own template, so nothing
 * here renders HTML from the archive. */
function parseGuide(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n")
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) continue
    if (line.startsWith("```")) {
      const body: string[] = []
      while (++index < lines.length && !lines[index].startsWith("```")) body.push(lines[index])
      blocks.push({ kind: "code", text: body.join("\n") })
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] })
      continue
    }
    if (line.startsWith("|")) {
      const rows: string[][] = []
      for (; index < lines.length && lines[index].startsWith("|"); index++) {
        const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim())
        if (!cells.every((cell) => /^-+$/.test(cell))) rows.push(cells)
      }
      index--
      blocks.push({ kind: "table", rows })
      continue
    }
    const item = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line)
    if (item) {
      const ordered = Boolean(item[2])
      const items: string[] = []
      for (; index < lines.length; index++) {
        const next = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(lines[index])
        if (next && Boolean(next[2]) === ordered) items.push(next[3])
        else if (lines[index].trim() && !next && /^\s{2,}/.test(lines[index])) items[items.length - 1] += ` ${lines[index].trim()}`
        else break
      }
      index--
      blocks.push({ kind: "list", ordered, items })
      continue
    }
    const paragraph: string[] = [line]
    while (index + 1 < lines.length && lines[index + 1].trim() && !/^(#|```|\||\s*(?:[-*]|\d+\.)\s)/.test(lines[index + 1])) {
      paragraph.push(lines[++index])
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") })
  }
  return blocks
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`")) {
      return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[11.5px] text-foreground">{part.slice(1, -1)}</code>
    }
    if (part.startsWith("**")) return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
    return part
  })
}

function GuideBody({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-muted-foreground">
      {parseGuide(markdown).map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p key={index} className={cn("font-semibold text-foreground", block.level <= 2 ? "mt-2 text-[15px]" : "mt-1 text-[13.5px]")}>
              {inline(block.text)}
            </p>
          )
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul"
          return (
            <List key={index} className={cn("flex flex-col gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc marker:text-brand-500")}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
            </List>
          )
        }
        if (block.kind === "table") {
          return (
            <div key={index} className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-[12.5px]">
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={cn("border-b border-border last:border-b-0", rowIndex === 0 && "bg-muted font-semibold text-foreground")}>
                      {row.map((cell, cellIndex) => <td key={cellIndex} className="px-2.5 py-1.5 align-top">{inline(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.kind === "code") {
          return <pre key={index} className="whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-[11.5px] text-foreground">{block.text}</pre>
        }
        return <p key={index}>{inline(block.text)}</p>
      })}
    </div>
  )
}

/** The AI repair guide, shown beside the problems instead of in a dialog. */
export function RepairGuide({
  guide,
  onClose,
  className,
  inert,
}: {
  guide: AdtBundleImportPreview["agentGuide"]
  onClose: () => void
  className?: string
  inert?: boolean
}) {
  const { t } = useLingui()
  const version = guide.currentVersion
  return (
    <section
      aria-label={t`AI repair guide`}
      inert={inert}
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-brand-200 bg-card dark:border-brand-800", className)}
    >
      <header className="flex items-center gap-3 border-b border-border bg-brand-500/5 px-4 py-3">
        <BookOpen aria-hidden="true" className="size-[18px] shrink-0 text-brand-600 dark:text-brand-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground"><Trans>AI repair guide</Trans></h3>
          <p className="text-xs text-muted-foreground"><Trans>The rules ADT Studio checks. Your assistant gets them with the repair request.</Trans></p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t`Close the guide`} className="size-8 p-0">
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <GuideBody markdown={guide.currentGuide} />
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <CopyTextButton value={guide.repairPrompt}><Trans>Copy repair request</Trans></CopyTextButton>
        <CopyTextButton value={guide.currentGuide}><Trans>Copy full guide</Trans></CopyTextButton>
        <span className="ml-auto text-xs text-muted-foreground">
          {guide.status === "current" ? <Trans>Guide version {version} · already in the archive</Trans> : <Trans>Guide version {version} · not yet in the archive</Trans>}
        </span>
      </footer>
    </section>
  )
}
