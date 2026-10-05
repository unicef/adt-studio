import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Plus, Search } from "lucide-react"
import type { TocEntry, TocSection } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToc } from "@/hooks/use-toc"
import { useSaveToc } from "./shared/mutations"
import { useTocSections } from "./shared/queries"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { SaveError, StepBody, StepEmptyHint, StepRail } from "./shared/ui"
import { tocVersionDiff } from "./shared/versionDiffs"
import { MAX_TOC_LEVEL, MIN_TOC_LEVEL, TocEntryRow } from "./toc/TocEntryRow"
import type { StepProps } from "./shared/types"

const NO_SECTIONS: TocSection[] = []

export function TocStep(props: StepProps) {
  const { label, plugin, frame } = props
  const { t } = useLingui()
  const query = useToc(label)
  const save = useSaveToc(label)

  const entries = useMemo(() => query.data?.entries ?? [], [query.data])
  const sectionsQuery = useTocSections(label, entries.length > 0)
  const sections = sectionsQuery.data ?? NO_SECTIONS

  const [activeLevel, setActiveLevel] = useState<string>("")
  const [search, setSearch] = useState("")

  const levels = useMemo(() => {
    const counts = new Map<number, number>()
    for (const entry of entries) counts.set(entry.level, (counts.get(entry.level) ?? 0) + 1)
    return [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, count]) => ({ key: String(level), title: t`Level ${level}`, count }))
  }, [entries, t])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (activeLevel !== "" && String(entry.level) !== activeLevel) return false
      if (!needle) return true
      return entry.title.toLowerCase().includes(needle)
    })
  }, [entries, activeLevel, search])

  const persist = useCallback(
    (next: TocEntry[]) => {
      if (!query.data) return
      save.mutate({ ...query.data, entries: next })
    },
    [query.data, save],
  )

  const patch = useCallback(
    (id: string, changes: Partial<TocEntry>) => {
      persist(entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)))
    },
    [entries, persist],
  )

  const shiftLevel = useCallback(
    (id: string, delta: number) => {
      const current = entries.find((entry) => entry.id === id)
      if (!current) return
      const level = Math.min(MAX_TOC_LEVEL, Math.max(MIN_TOC_LEVEL, current.level + delta))
      if (level === current.level) return
      persist(entries.map((entry) => (entry.id === id ? { ...entry, level } : entry)))
    },
    [entries, persist],
  )

  const removeEntry = useCallback(
    (id: string) => {
      persist(entries.filter((entry) => entry.id !== id))
    },
    [entries, persist],
  )

  const insertAfter = useCallback(
    (afterId: string | null, level: number) => {
      setSearch("")
      setActiveLevel("")
      const created: TocEntry = {
        id: `toc_new_${Date.now()}`,
        title: t`New entry`,
        sectionId: "",
        href: "",
        chapterId: "",
        level,
      }
      if (afterId === null) {
        persist([...entries, created])
        return
      }
      const index = entries.findIndex((entry) => entry.id === afterId)
      if (index === -1) return
      persist([...entries.slice(0, index + 1), created, ...entries.slice(index + 1)])
    },
    [entries, persist, t],
  )

  const openPreview = frame.onOpenPreview
  const previewSection = useCallback(
    (sectionId: string) => openPreview(sectionId),
    [openPreview],
  )

  const versionDiff = useMemo(() => tocVersionDiff(t), [t])

  const loading = useStepLoading(props, { isLoading: query.isLoading, hasOutput: entries.length > 0 })
  if (loading) return <StepLoading {...props} />
  if (entries.length === 0) return <StepEmpty {...props} />

  const deepest = Math.max(...entries.map((entry) => entry.level))

  return (
    <StepShell
      {...props}
      chips={[t`${entries.length} entries`, t`${deepest} levels`]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="toc-generation"
          currentVersion={query.data?.version ?? null}
          isSaving={save.isPending}
          diff={versionDiff}
        />
      }
      canApply={entries.length > 0}
      rail={
        <StepRail
          heading={<Trans>Outline depth</Trans>}
          hex={plugin.hex}
          entries={[{ key: "", title: t`Whole outline`, count: entries.length }, ...levels]}
          activeKey={activeLevel}
          onSelect={(key) => setActiveLevel(key ?? "")}
          footer={<Trans>Titles are what the reader sees in the navigation menu.</Trans>}
        />
      }
    >
      <StepBody
        title={<Trans>Table of contents</Trans>}
        meta={t`${entries.length} entries`}
        actions={
          <>
            <Input
              wrapperClassName="w-[220px]"
              className="h-8"
              prependIcon={<Search className="size-3.5" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t`Search entries…`}
            />
            <Button size="sm" variant="outline" onClick={() => insertAfter(null, MIN_TOC_LEVEL)}>
              <Plus className="size-3.5" />
              <Trans>Add entry</Trans>
            </Button>
          </>
        }
      >
        <SaveError error={save.error} />

        {shown.length === 0 ? (
          <StepEmptyHint>
            <Trans>No entries match this filter.</Trans>
          </StepEmptyHint>
        ) : (
          <div className="flex flex-col gap-1.5">
            {shown.map((entry) => (
              <TocEntryRow
                key={entry.id}
                entry={entry}
                sections={sections}
                hex={plugin.hex}
                isSaving={save.isPending}
                onPatch={patch}
                onShiftLevel={shiftLevel}
                onInsertAfter={insertAfter}
                onRemove={removeEntry}
                onPreview={previewSection}
              />
            ))}
          </div>
        )}
      </StepBody>
    </StepShell>
  )
}
