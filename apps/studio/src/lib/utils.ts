import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isElectron(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("electron") &&
    typeof window !== "undefined" &&
    typeof window.api === "object"
  )
}
export function formatBytes(bytes: number): string {
  /* eslint-disable-next-line lingui/no-unlocalized-strings */
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  /* eslint-disable-next-line lingui/no-unlocalized-strings */
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
