import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { stripTransientIds, useCanvasEditing } from "../editing/CanvasEditing"
import { htmlSourceCodec, tokenizeHtml, type HtmlToken } from "./htmlSource"

const TYPING_DEBOUNCE_MS = 200

const tone = {
  punct: "text-muted-foreground",
  tag: "text-sky-700 dark:text-sky-300",
  attr: "text-violet-700 dark:text-violet-300",
  value: "text-emerald-700 dark:text-emerald-300",
  text: "text-foreground",
  comment: "text-muted-foreground/80",
  code: "text-amber-800 dark:text-amber-200",
}

const surfaceClass =
  "m-0 box-border px-4 pb-[120px] pt-1 font-mono text-[12px] leading-relaxed tracking-normal whitespace-pre-wrap [overflow-wrap:anywhere] [tab-size:2] [font-variant-ligatures:none] [scrollbar-gutter:stable]"

function tagParts(tag: string, key: string): ReactNode[] {
  const parts: ReactNode[] = []
  const head = /^(<\/?)([A-Za-z][\w:-]*)/.exec(tag)
  if (!head) return [<span key={key} className={tone.comment}>{tag}</span>]
  parts.push(<span key={`${key}-o`} className={tone.punct}>{head[1]}</span>)
  parts.push(<span key={`${key}-n`} className={tone.tag}>{head[2]}</span>)
  const pattern = /(\s+)|("[^"]*"?|'[^']*'?)|(=)|(\/?>)|([^\s="'/>]+)|([\s\S])/g
  const rest = tag.slice(head[0].length)
  let afterEquals = false
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(rest))) {
    const [chunk, space, quoted, equals, end, word] = match
    const id = `${key}-${index++}`
    if (space) {
      parts.push(chunk)
      continue
    }
    if (quoted || (word && afterEquals)) parts.push(<span key={id} className={tone.value}>{chunk}</span>)
    else if (equals || end) parts.push(<span key={id} className={tone.punct}>{chunk}</span>)
    else if (word) parts.push(<span key={id} className={tone.attr}>{chunk}</span>)
    else parts.push(chunk)
    afterEquals = !!equals
  }
  return parts
}

function highlight(tokens: HtmlToken[], prefix: string): ReactNode[] {
  return tokens.flatMap<ReactNode>((token, index) => {
    const key = `${prefix}${index}`
    if (token.kind === "open" || token.kind === "close") return tagParts(token.value, key)
    if (token.kind === "comment" || token.kind === "decl") return [<span key={key} className={tone.comment}>{token.value}</span>]
    if (token.kind === "raw") {
      const parent = tokens[index - 1]?.name
      return parent === "pre"
        ? highlight(tokenizeHtml(token.value), `${key}.`)
        : [<span key={key} className={tone.code}>{token.value}</span>]
    }
    return [<span key={key} className={tone.text}>{token.value}</span>]
  })
}

export function HtmlSourceEditor({ sectionIndex }: { sectionIndex: number }) {
  const { t } = useLingui()
  const editing = useCanvasEditing()
  const external = stripTransientIds(editing.sectionHtml(sectionIndex) ?? "")
  const [codec, setCodec] = useState(() => htmlSourceCodec(external))
  const [text, setText] = useState(() => codec.format(external))
  const sent = useRef(external)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const backdrop = useRef<HTMLPreElement>(null)
  const { recordEdit } = editing

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current === null) return
    const value = codec.compact(pending.current)
    pending.current = null
    if (value === sent.current) return
    sent.current = value
    recordEdit(sectionIndex, value, { reload: true })
  }, [codec, recordEdit, sectionIndex])

  useEffect(() => {
    if (external === sent.current || pending.current !== null) return
    const next = htmlSourceCodec(external)
    sent.current = external
    setCodec(next)
    setText(next.format(external))
  }, [external])

  useEffect(() => () => flush(), [flush])

  const painted = useMemo(() => highlight(tokenizeHtml(text), ""), [text])

  return (
    <div className="relative min-h-0 flex-1">
      <pre ref={backdrop} aria-hidden className={`${surfaceClass} pointer-events-none absolute inset-0 overflow-hidden`}>
        {painted}
        {"\n "}
      </pre>
      <textarea
        aria-label={t`HTML source of section ${sectionIndex + 1}`}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          pending.current = event.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(flush, TYPING_DEBOUNCE_MS)
        }}
        onScroll={(event) => {
          if (!backdrop.current) return
          backdrop.current.scrollTop = event.currentTarget.scrollTop
          backdrop.current.scrollLeft = event.currentTarget.scrollLeft
        }}
        onBlur={flush}
        disabled={editing.locked}
        className={`${surfaceClass} absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent text-transparent caret-foreground outline-none selection:bg-sky-500/25 disabled:opacity-60`}
      />
    </div>
  )
}
