export function tint(hex: string, alpha = 0.12): string {
  const value = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${value}`
}
