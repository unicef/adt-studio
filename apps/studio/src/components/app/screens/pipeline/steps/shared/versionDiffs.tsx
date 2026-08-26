import type { ReactNode } from "react"
import type {
  CoreTtsCatalogEntry,
  EasyReadEntry,
  EasyReadSectionBlock,
  GlossaryItem,
  QuizItem,
  TextCatalogEntry,
  TocEntry,
} from "@/api/client"
import type { VersionDiffDescriptor } from "@/components/pipeline/components/VersionCompareDialog"
import { QuizVersionDiffItem } from "../quizzes/QuizVersionDiffItem"

/**
 * Diff descriptors for the version picker, one per book-level step.
 *
 * They live at module scope and are built by a factory taking only `t`, so a
 * step can `useMemo` one into a reference that survives every render. That
 * matters: the picker's per-version change counts are an O(versions × items)
 * pass, and a descriptor rebuilt inline each render would either invalidate
 * that memo constantly or force it to lie about its dependencies.
 */
type Translate = (descriptor: TemplateStringsArray, ...args: unknown[]) => string

export function tocVersionDiff(t: Translate): VersionDiffDescriptor {
  return {
    items: (data) => (data as { entries?: TocEntry[] } | null)?.entries ?? [],
    keyOf: (item) => (item as TocEntry).id,
    isEqual: (a, b) => {
      const x = a as TocEntry
      const y = b as TocEntry
      return (
        x.title === y.title &&
        x.sectionId === y.sectionId &&
        x.href === y.href &&
        x.level === y.level
      )
    },
    diffText: (item) => (item as TocEntry).title,
    searchText: (item) => (item as TocEntry).title,
    searchPlaceholder: t`Search entries…`,
    renderItem: (item, ctx) => {
      const entry = item as TocEntry
      return (
        <span
          className="flex items-center gap-1.5"
          style={{ paddingLeft: (Math.min(entry.level, 3) - 1) * 20 }}
        >
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider tabular-nums ring-1 ${
              ctx?.accentClass ?? "bg-slate-100 text-slate-700 ring-slate-300"
            }`}
          >
            {t`H${entry.level}`}
          </span>
          <span className="truncate font-medium text-foreground">{ctx?.diff ?? entry.title}</span>
        </span>
      )
    },
  }
}

export function glossaryVersionDiff(t: Translate): VersionDiffDescriptor {
  return {
    items: (data) =>
      (data as { items?: GlossaryItem[] } | null)?.items?.filter((item) => !item.pruned) ?? [],
    keyOf: (item) => (item as GlossaryItem).id ?? (item as GlossaryItem).word,
    diffText: (item) => (item as GlossaryItem).definition ?? "",
    searchText: (item) => {
      const term = item as GlossaryItem
      return `${term.word} ${term.definition ?? ""}`
    },
    searchPlaceholder: t`Search terms or definitions…`,
    renderItem: (item, ctx) => {
      const term = item as GlossaryItem
      return (
        <span>
          <span className="font-semibold text-foreground">
            {term.emojis?.[0] ? `${term.emojis[0]} ` : ""}
            {term.word}
          </span>
          {ctx?.diff ? (
            <span className="text-muted-foreground"> — {ctx.diff}</span>
          ) : term.definition ? (
            <span className="text-muted-foreground"> — {term.definition}</span>
          ) : null}
        </span>
      )
    },
  }
}

export function quizzesVersionDiff(t: Translate): VersionDiffDescriptor {
  return {
    unifiedList: true,
    items: (data) => (data as { quizzes?: QuizItem[] } | null)?.quizzes ?? [],
    // quizIndex is positional (renumbered 0..n on add/delete), so it is not a
    // stable cross-version identity — one delete would shift every index and
    // report the whole set as changed. Key by the question text instead, which
    // reads add/delete correctly at the cost of showing an edited question as
    // remove + add.
    keyOf: (item) => (item as QuizItem).question,
    isEqual: (a, b) => {
      const x = a as QuizItem
      const y = b as QuizItem
      return (
        x.question === y.question &&
        x.answerIndex === y.answerIndex &&
        JSON.stringify(x.options) === JSON.stringify(y.options)
      )
    },
    searchText: (item) => {
      const quiz = item as QuizItem
      return `${quiz.question} ${quiz.options.flatMap((o) => [o.text, o.explanation]).join(" ")}`
    },
    searchPlaceholder: t`Search questions, answers, or explanations…`,
    renderItem: (item, ctx) => (
      <QuizVersionDiffItem quiz={item as QuizItem} previous={ctx?.before as QuizItem | undefined} />
    ),
  }
}

const PAGE_ID_RE = /^pg0*(\d+)/

export function translationVersionDiff(
  t: Translate,
  sourceById: ReadonlyMap<string, string>,
): VersionDiffDescriptor {
  return {
    items: (data) => (data as { entries?: TextCatalogEntry[] } | null)?.entries ?? [],
    keyOf: (item) => (item as TextCatalogEntry).id,
    diffText: (item) => (item as TextCatalogEntry).text ?? "",
    searchText: (item) => {
      const entry = item as TextCatalogEntry
      return `${entry.id} ${sourceById.get(entry.id) ?? ""} ${entry.text ?? ""}`
    },
    searchPlaceholder: t`Search source or translation…`,
    renderItem: (item, ctx): ReactNode => {
      const entry = item as TextCatalogEntry
      const page = PAGE_ID_RE.exec(entry.id)
      const source = sourceById.get(entry.id)
      return (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">
            <span className="rounded bg-muted px-1 py-0.5 font-mono font-semibold">{entry.id}</span>
            {page ? <span className="tabular-nums">{t`p${page[1]}`}</span> : null}
          </span>
          {source && source !== entry.text ? (
            <span className="line-clamp-2 text-[11px] text-muted-foreground">{source}</span>
          ) : null}
          {ctx?.diff ? (
            <span className="text-foreground">{ctx.diff}</span>
          ) : entry.text ? (
            <span className="text-foreground">{entry.text}</span>
          ) : null}
        </span>
      )
    },
  }
}

export function easyReadVersionDiff(t: Translate): VersionDiffDescriptor {
  return {
    items: (data) =>
      (data as { blocks?: EasyReadSectionBlock[] } | null)?.blocks?.flatMap(
        (block) => block.entries,
      ) ?? [],
    keyOf: (item) => (item as EasyReadEntry).easyReadId,
    isEqual: (a, b) => {
      const x = a as EasyReadEntry
      const y = b as EasyReadEntry
      return x.text === y.text && x.originalText === y.originalText
    },
    diffText: (item) => (item as EasyReadEntry).text ?? "",
    searchText: (item) => {
      const entry = item as EasyReadEntry
      return `${entry.originalText ?? ""} ${entry.text ?? ""}`
    },
    searchPlaceholder: t`Search original or Easy Read text…`,
    renderItem: (item, ctx) => {
      const entry = item as EasyReadEntry
      const page = PAGE_ID_RE.exec(entry.pageId ?? "")
      return (
        <span className="flex min-w-0 flex-col gap-0.5">
          {page ? (
            <span className="text-[9px] font-semibold uppercase tracking-wide tabular-nums text-muted-foreground">
              {t`p${page[1]}`}
            </span>
          ) : null}
          {entry.originalText && entry.originalText !== entry.text ? (
            <span className="line-clamp-2 text-[11px] text-muted-foreground">
              {entry.originalText}
            </span>
          ) : null}
          {ctx?.diff ? (
            <span className="text-foreground">{ctx.diff}</span>
          ) : entry.text ? (
            <span className="text-foreground">{entry.text}</span>
          ) : null}
        </span>
      )
    },
  }
}

export function speechVersionDiff(t: Translate): VersionDiffDescriptor {
  return {
    items: (data) => (data as { entries?: CoreTtsCatalogEntry[] } | null)?.entries ?? [],
    keyOf: (item) => (item as CoreTtsCatalogEntry).id,
    diffText: (item) => {
      const speech = item as CoreTtsCatalogEntry
      return speech.speechText ?? speech.failureReason ?? ""
    },
    searchText: (item) => {
      const speech = item as CoreTtsCatalogEntry
      return `${speech.id} ${speech.displayText} ${speech.speechText ?? ""}`
    },
    searchPlaceholder: t`Search display or speech text…`,
    renderItem: (item, ctx) => {
      const speech = item as CoreTtsCatalogEntry
      return (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-1 text-[11px] text-muted-foreground">
            {speech.displayText}
          </span>
          {ctx?.diff ? (
            <span className="text-foreground">{ctx.diff}</span>
          ) : speech.speechText ? (
            <span className="text-foreground">{speech.speechText}</span>
          ) : null}
        </span>
      )
    },
  }
}
