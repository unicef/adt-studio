import { useMemo } from "react"

type Op = { type: "same" | "del" | "add"; text: string }

// Word-level LCS diff: tokenize keeping whitespace, then backtrack the LCS table
// into same/del/add runs. Token counts are small (a definition / sentence), so
// the O(m·n) table is cheap.
function wordDiff(before: string, after: string): Op[] {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) ops.push({ type: "same", text: a[i++] }), j++
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ type: "del", text: a[i++] })
    else ops.push({ type: "add", text: b[j++] })
  }
  while (i < m) ops.push({ type: "del", text: a[i++] })
  while (j < n) ops.push({ type: "add", text: b[j++] })
  return ops
}

/**
 * Renders `before → after` as a single inline word-level diff: removed words
 * struck through in rose, added words highlighted in emerald, unchanged text
 * plain. Whitespace is never highlighted. Shared by the version-compare dialog
 * so every stage's edited items show *what* changed at a glance.
 */
export function InlineDiff({ before, after }: { before: string; after: string }) {
  const ops = useMemo(() => wordDiff(before ?? "", after ?? ""), [before, after])
  return (
    <span className="leading-snug">
      {ops.map((op, i) => {
        if (op.text === "") return null
        if (op.type === "same" || /^\s+$/.test(op.text)) return <span key={i}>{op.text}</span>
        if (op.type === "del")
          return (
            <span
              key={i}
              className="mx-0.5 rounded bg-rose-100 px-1 text-rose-700 line-through decoration-rose-400"
            >
              {op.text}
            </span>
          )
        return (
          <span key={i} className="mx-0.5 rounded bg-emerald-100 px-1 text-emerald-800">
            {op.text}
          </span>
        )
      })}
    </span>
  )
}
