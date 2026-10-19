const LOCALE = "en-US"
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const twoDecimals = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" })

export const fmtInt = (n: number) => integer.format(n)
export const fmtDec1 = (n: number) => oneDecimal.format(n)
export const fmtUsd = (n: number) => `$${twoDecimals.format(n)}`
export const fmtDateTime = (ms: number) => dateTime.format(ms)
export const fmtMinutes = (s: number) => `${Math.round(s / 60)} min`

export function fmtPct(ratio: number): string {
  const sign = ratio > 0 ? "+" : ratio < 0 ? "−" : ""
  return `${sign}${oneDecimal.format(Math.abs(ratio * 100))}%`
}

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${oneDecimal.format(seconds)} s`
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} min ${String(total % 60).padStart(2, "0")} s`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`
}

export function fmtTokens(n: number): string {
  if (n >= 1e6) return `${twoDecimals.format(n / 1e6)}M`
  if (n >= 1e4) return `${integer.format(Math.round(n / 1e3))}k`
  return integer.format(n)
}

export function fmtBytes(n: number): string {
  if (n >= 1e6) return `${oneDecimal.format(n / 1e6)} MB`
  return `${integer.format(Math.round(n / 1e3))} KB`
}
