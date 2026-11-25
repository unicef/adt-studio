export type LineDiffOp = { kind: "same" | "add" | "del"; text: string }
export type LineDiffRow = LineDiffOp | { kind: "gap"; hidden: number }

export function diffLines(before: string, after: string): LineDiffOp[] {
  const a = before.split("\n")
  const b = after.split("\n")
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const ops: LineDiffOp[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i++] })
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ kind: "del", text: a[i++] })
    else ops.push({ kind: "add", text: b[j++] })
  }
  while (i < a.length) ops.push({ kind: "del", text: a[i++] })
  while (j < b.length) ops.push({ kind: "add", text: b[j++] })
  return ops
}

export function withContext(ops: LineDiffOp[], context = 3): LineDiffRow[] {
  const keep = ops.map((op, index) =>
    op.kind !== "same" || ops.slice(Math.max(0, index - context), index + context + 1).some((near) => near.kind !== "same"),
  )
  const rows: LineDiffRow[] = []
  ops.forEach((op, index) => {
    if (keep[index]) rows.push(op)
    else {
      const last = rows.at(-1)
      if (last?.kind === "gap") last.hidden++
      else rows.push({ kind: "gap", hidden: 1 })
    }
  })
  return rows
}
