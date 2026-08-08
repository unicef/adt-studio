import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { EyeOff, Plus, Search, Sparkles, Undo2 } from "lucide-react"
import type { GlossaryItem } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGlossary } from "@/hooks/use-glossary"
import { cn } from "@/lib/utils"
import { useSaveGlossary } from "./mutations"
import { StepEmpty, StepLoading, StepShell } from "./StepShell"
import { EditableText, RowAction, SaveError, StepBody, StepCard, StepEmptyHint, StepRail } from "./ui"
import type { StepProps } from "./types"

export function GlossaryStep(props: StepProps) {
  const { label, plugin } = props
  const { t } = useLingui()
  const query = useGlossary(label)
  const save = useSaveGlossary(label)

  const [search, setSearch] = useState("")
  const [letter, setLetter] = useState<string>("")

  const items = useMemo(() => query.data?.items ?? [], [query.data])

  const letters = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      const key = (item.word[0] ?? "?").toUpperCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({
      key,
      title: key,
      count,
    }))
  }, [items])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (letter !== "" && (item.word[0] ?? "?").toUpperCase() !== letter) return false
      if (!q) return true
      return (item.word + " " + item.definition + " " + item.variations.join(" ")).toLowerCase().includes(q)
    })
  }, [items, search, letter])

  const persist = (next: GlossaryItem[]) => {
    if (!query.data) return
    save.mutate({ ...query.data, items: next })
  }

  const patch = (index: number, changes: Partial<GlossaryItem>) => {
    persist(items.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  }

  const addTerm = () => {
    persist([
      { word: t`New term`, definition: "", variations: [], emojis: [], source: "manual" },
      ...items,
    ])
    setLetter("")
    setSearch("")
  }

  if (query.isLoading) return <StepLoading {...props} />
  if (items.length === 0) return <StepEmpty {...props} onManual={addTerm} />

  const active = items.filter((i) => !i.pruned).length

  return (
    <StepShell
      {...props}
      chips={[t`${active} terms`, t`v${query.data?.version ?? 1}`]}
      canApply={active > 0}
      rail={
        <StepRail
          heading={<Trans>Terms by letter</Trans>}
          hex={plugin.hex}
          entries={[{ key: "", title: t`All terms`, count: items.length }, ...letters]}
          activeKey={letter}
          onSelect={(key) => setLetter(key ?? "")}
          footer={<Trans>{active} kept · {items.length - active} pruned</Trans>}
        />
      }
    >
      <StepBody
        title={<Trans>Glossary</Trans>}
        meta={t`${items.length} terms`}
        actions={
          <>
            <Input
              wrapperClassName="w-[220px]"
              className="h-8"
              prependIcon={<Search className="size-3.5" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t`Search terms…`}
            />
            <Button size="sm" variant="outline" onClick={addTerm}>
              <Plus className="size-3.5" />
              <Trans>Add term</Trans>
            </Button>
          </>
        }
      >
        <SaveError error={save.error} />

        {shown.length === 0 ? (
          <StepEmptyHint>
            <Trans>No terms match this filter.</Trans>
          </StepEmptyHint>
        ) : (
          shown.map((item) => {
            const index = items.indexOf(item)
            return (
              <StepCard key={item.id ?? `${item.word}-${index}`} muted={item.pruned} accent={plugin.hex}>
                <div className="flex items-center gap-2">
                  {item.source === "ai" ? (
                    <Sparkles className="size-3 shrink-0" style={{ color: plugin.hex }} />
                  ) : (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Trans>manual</Trans>
                    </span>
                  )}
                  <EditableText
                    value={item.word}
                    multiline={false}
                    ariaLabel={t`term`}
                    isSaving={save.isPending}
                    onSave={(word) => patch(index, { word })}
                    className="text-sm font-bold"
                  />
                  {item.emojis.length > 0 && (
                    <span className="shrink-0 tracking-[2px]">{item.emojis.join("")}</span>
                  )}
                  {item.variations.map((variation) => (
                    <span
                      key={variation}
                      className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {variation}
                    </span>
                  ))}
                  <div className="ml-auto flex shrink-0 gap-1">
                    <RowAction
                      icon={item.pruned ? Undo2 : EyeOff}
                      label={item.pruned ? t`Restore term` : t`Prune term`}
                      onClick={() => patch(index, { pruned: !item.pruned })}
                    />
                  </div>
                </div>

                <EditableText
                  value={item.definition}
                  ariaLabel={t`definition of ${item.word}`}
                  placeholder={t`Add a definition…`}
                  isSaving={save.isPending}
                  onSave={(definition) => patch(index, { definition })}
                  className={cn("text-[12.5px] leading-relaxed")}
                />
              </StepCard>
            )
          })
        )}
      </StepBody>
    </StepShell>
  )
}
