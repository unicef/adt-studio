import type { ReactNode } from "react"
import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { ArrowRight, PenLine, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { getDisplayName } from "@/lib/languages"
import { PreviewShell } from "@/components/wizard/shared/PreviewShell"

const HEADER_LABEL = msg`Languages`
const WHILE_EDITING_LABEL = msg`While editing`
const READERS_SEE_LABEL = msg`Readers see`
const ORIGINAL_LANGUAGE_LABEL = msg`Original language`
const EDITED_IN_LABEL = msg`Edited in`
const PUBLISHED_IN_LABEL = msg`published in`
const ITS_ORIGINAL_LANGUAGE = msg`its original language`
const LANGUAGE_LIST_TWO_JOINER = msg` and `
const LANGUAGE_LIST_SEP = msg`, `
const LANGUAGE_LIST_OXFORD = msg`, and `

function formatLanguageList(codes: string[], i18n: I18n): string {
  const names = codes.map((code) => getDisplayName(code) || code)
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]!
  if (names.length === 2) {
    return `${names[0]}${i18n._(LANGUAGE_LIST_TWO_JOINER)}${names[1]}`
  }
  return `${names.slice(0, -1).join(i18n._(LANGUAGE_LIST_SEP))}${i18n._(LANGUAGE_LIST_OXFORD)}${names[names.length - 1]}`
}

function LanguageChip({
  code,
  variant = "muted",
}: {
  code: string
  variant?: "muted" | "primary"
}) {
  const name = getDisplayName(code) || code
  return (
    <div
      className={cn(
        "animate-chip-enter flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        variant === "primary"
          ? "border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-border bg-card text-foreground",
      )}
    >
      <span className="text-xs font-medium">{name}</span>
      <span
        className={cn(
          "text-[10px]",
          variant === "primary" ? "text-sky-400" : "text-muted-foreground",
        )}
      >
        {code}
      </span>
    </div>
  )
}

function DefaultChip({ label }: { label: string }) {
  return (
    <span className="animate-chip-enter rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
      {label}
    </span>
  )
}

function MockLines() {
  return (
    <div className="flex w-full flex-col gap-1.5 pt-1">
      <div className="h-1.5 w-full rounded-full bg-muted/60" />
      <div className="h-1.5 w-4/5 rounded-full bg-muted/60" />
      <div className="h-1.5 w-3/5 rounded-full bg-muted/40" />
    </div>
  )
}

function MockCard({
  icon,
  role,
  headerClassName,
  children,
}: {
  icon: ReactNode
  role: string
  headerClassName: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className={cn("flex items-center gap-1.5 px-3 py-2", headerClassName)}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{role}</span>
      </div>
      <div className="flex flex-1 flex-col items-center gap-2 px-3 py-3">{children}</div>
    </div>
  )
}

function SummaryText({
  editingLanguage,
  outputLanguages,
}: {
  editingLanguage: string
  outputLanguages: string[]
}) {
  const { i18n } = useLingui()
  const hasEditing = editingLanguage.trim() !== ""
  const hasOutput = outputLanguages.length > 0
  const editingName = hasEditing ? (getDisplayName(editingLanguage) || editingLanguage) : null
  const outputList = hasOutput ? formatLanguageList(outputLanguages, i18n) : null

  const editPart = editingName ? (
    <strong className="font-semibold text-sky-600">{editingName}</strong>
  ) : (
    <>{i18n._(ITS_ORIGINAL_LANGUAGE)}</>
  )

  const outputPart = outputList ? (
    <strong className="font-semibold text-emerald-600">{outputList}</strong>
  ) : (
    <>{i18n._(ITS_ORIGINAL_LANGUAGE)}</>
  )

  return (
    <p className="animate-sentence-enter max-w-[260px] text-center text-xs leading-relaxed text-muted-foreground">
      {i18n._(EDITED_IN_LABEL)} {editPart}, {i18n._(PUBLISHED_IN_LABEL)} {outputPart}.
    </p>
  )
}

export function LanguagesPreviewPane({
  editingLanguage,
  outputLanguages,
}: {
  editingLanguage: string
  outputLanguages: string[]
}) {
  const { i18n } = useLingui()
  const hasEditing = editingLanguage.trim() !== ""
  const hasOutput = outputLanguages.length > 0
  const originalLanguageLabel = i18n._(ORIGINAL_LANGUAGE_LABEL)

  return (
    <PreviewShell label={i18n._(HEADER_LABEL)}>
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-5 px-5 py-8">
          <div className="flex w-full items-stretch gap-2">
            <MockCard
              icon={<PenLine className="h-3 w-3 text-sky-500" />}
              role={i18n._(WHILE_EDITING_LABEL)}
              headerClassName="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-b border-sky-500/20"
            >
              {hasEditing ? (
                <LanguageChip key={editingLanguage} code={editingLanguage} variant="primary" />
              ) : (
                <DefaultChip key="default-editing" label={originalLanguageLabel} />
              )}
              <MockLines />
            </MockCard>

            <div className="flex shrink-0 items-center text-muted-foreground/50" aria-hidden>
              <ArrowRight className="h-4 w-4" />
            </div>

            <MockCard
              icon={<Globe className="h-3 w-3 text-emerald-500" />}
              role={i18n._(READERS_SEE_LABEL)}
              headerClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-b border-emerald-500/20"
            >
              {hasOutput ? (
                <div className="flex flex-wrap justify-center gap-1">
                  {outputLanguages.map((code) => (
                    <LanguageChip key={code} code={code} />
                  ))}
                </div>
              ) : (
                <DefaultChip key="default-output" label={originalLanguageLabel} />
              )}
              <MockLines />
            </MockCard>
          </div>

          <div className="h-px w-full bg-border/60" />

          <SummaryText
            key={`${editingLanguage}|${outputLanguages.join(",")}`}
            editingLanguage={editingLanguage}
            outputLanguages={outputLanguages}
          />
        </div>
    </PreviewShell>
  )
}
