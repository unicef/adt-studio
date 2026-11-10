export function formatSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes < 1024
      ? [bytes, "byte" as const]
      : bytes < 1024 * 1024
        ? [bytes / 1024, "kilobyte" as const]
        : [bytes / (1024 * 1024), "megabyte" as const]
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "byte" ? 0 : 1,
  }).format(value)
}
