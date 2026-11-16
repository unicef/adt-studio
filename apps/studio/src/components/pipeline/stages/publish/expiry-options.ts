import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export type ExpiryChoiceValue = "7" | "30" | "90" | "never"

export interface ExpiryOption {
  value: ExpiryChoiceValue
  label: MessageDescriptor
  days: number | null
}

export const EXPIRY_OPTIONS: readonly ExpiryOption[] = [
  { value: "7", label: msg`7 days`, days: 7 },
  { value: "30", label: msg`30 days`, days: 30 },
  { value: "90", label: msg`90 days`, days: 90 },
  { value: "never", label: msg`No end date`, days: null },
]

export const DEFAULT_EXPIRY_CHOICE: ExpiryChoiceValue = "never"

/** Turns a choice into the ISO instant the routes take, or `null` for no expiry. */
export function expiryChoiceToIso(
  choice: ExpiryChoiceValue,
  now: Date = new Date(),
): string | null {
  const option = EXPIRY_OPTIONS.find((candidate) => candidate.value === choice)
  if (!option?.days) return null
  const end = new Date(now.getTime() + option.days * 24 * 60 * 60 * 1000)
  return end.toISOString()
}

/** Picks the choice closest to an existing expiry so "Change" opens on it. */
export function isoToExpiryChoice(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpiryChoiceValue {
  if (!expiresAt) return "never"
  const remainingDays = (Date.parse(expiresAt) - now.getTime()) / (24 * 60 * 60 * 1000)
  if (!Number.isFinite(remainingDays)) return "never"
  if (remainingDays <= 7) return "7"
  if (remainingDays <= 30) return "30"
  return "90"
}

export function formatPublishDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date)
}

export function formatPublishDateTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}
