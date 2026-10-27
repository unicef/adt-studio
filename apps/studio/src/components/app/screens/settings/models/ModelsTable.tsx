import { useRef, useState, type ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Brain, Search, X } from "lucide-react"
import { ModelSelect } from "@/components/pipeline/components/ModelSelect"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SETTINGS_ANCHORS } from "../nav"
import { DEFAULT_MODEL } from "../modelDefaults"
import {
  CustomModelDot,
  ICON_SWAP,
  PromptNames,
  ResetToDefaultButton,
  taskModelInputId,
} from "../taskModels/TaskModelIndicators"
import { EffortProblemNotice, EffortSelect, useEffortLabel } from "../taskModels/EffortSelect"
import { Highlight, matchesQuery, normalizeQuery } from "./search"
import {
  PromptWarning,
  UnsupportedModelNotice,
  useModelsFloatingSave,
  useSpecializedItems,
  type ModelsTableProps,
} from "./shared"

const CELL = "px-4 py-2.5 align-middle max-md:block max-md:px-[18px] max-md:py-1.5"
const ROW = "transition-colors duration-150 ease-out max-md:block max-md:py-2"

function GroupRow({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <tr id={id} className="scroll-mt-24 max-md:block">
      <th
        scope="colgroup"
        colSpan={5}
        className="border-t bg-muted/30 px-4 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground max-md:block max-md:px-[18px]"
      >
        {children}
      </th>
    </tr>
  )
}

export function ModelsTable(props: ModelsTableProps) {
  const { t } = useLingui()
  const { llm, specialized, tasks } = props
  useModelsFloatingSave(props)
  const specializedItems = useSpecializedItems(specialized)
  const effortLabel = useEffortLabel()
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState("")
  const query = normalizeQuery(search)

  const defaultLabel = t`Default LLM`
  const specializedLabel = t`Task-specific defaults`
  const showDefault = matchesQuery(query, [defaultLabel, llm.draft, DEFAULT_MODEL])
  const visibleGroups = tasks.groups
    .map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) =>
        matchesQuery(query, [
          tasks.labelOf(task),
          group.label,
          ...task.prompts,
          tasks.effectiveModelOf(task.id),
          (() => {
            const effort = tasks.effortOf(task.id)
            const level = effort.draft || effort.inherited
            return level ? effortLabel(level) : null
          })(),
        ]),
      ),
    }))
    .filter((group) => group.tasks.length > 0)
  const visibleSpecialized = specializedItems.filter((item) =>
    matchesQuery(query, [item.title, item.description, specializedLabel, ...item.usedBy, item.value || item.placeholder]),
  )

  const total = 1 + tasks.tasks.length + specializedItems.length
  const shown =
    Number(showDefault) +
    visibleGroups.reduce((sum, group) => sum + group.tasks.length, 0) +
    visibleSpecialized.length
  const inheritCount = tasks.tasks.filter(
    (task) => !tasks.isCustom(task.id) && tasks.inheritedOf(task.id).source.kind === "default",
  ).length
  const inheritanceHint = (taskId: string): string | null => {
    if (tasks.isCustom(taskId)) return null
    const { source } = tasks.inheritedOf(taskId)
    if (source.kind !== "task") return null
    const sourceTask = tasks.tasks.find((entry) => entry.id === source.taskId)
    const sourceLabel = sourceTask ? tasks.labelOf(sourceTask) : source.taskId
    return t`Inherited from ${sourceLabel}`
  }

  const clearSearch = () => {
    setSearch("")
    searchRef.current?.focus()
  }

  return (
    <>
      {llm.showPromptWarning && (
        <PromptWarning savedModel={llm.savedModel} className="mb-3 rounded-2xl border" />
      )}

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 rounded-t-2xl border-b pl-4 pr-2 transition-colors duration-150 ease-out focus-within:bg-muted/25">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && search) {
                event.stopPropagation()
                setSearch("")
              }
            }}
            placeholder={t`Search tasks, prompts or models…`}
            aria-label={t`Search tasks, prompts or models`}
            className="h-12 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          <span aria-live="polite" className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {query ? (
              <Trans>
                {shown} of {total}
              </Trans>
            ) : (
              <Plural value={total} one="# model setting" other="# model settings" />
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-9 text-muted-foreground",
              ICON_SWAP,
              search ? "scale-100 opacity-100 blur-0" : "pointer-events-none scale-[0.25] opacity-0 blur-[4px]",
            )}
            aria-label={t`Clear search`}
            tabIndex={search ? 0 : -1}
            aria-hidden={!search}
            onClick={clearSearch}
          >
            <X />
          </Button>
        </div>

        {(llm.isError || tasks.isError || specialized.isError) && (
          <p role="alert" className="border-b px-[18px] py-3 text-[12.5px] text-destructive">
            {llm.isError && <Trans>Unable to load the default LLM.</Trans>}{" "}
            {tasks.isError && <Trans>Unable to load the task models.</Trans>}{" "}
            {specialized.isError && <Trans>Unable to load the task-specific model defaults.</Trans>}
          </p>
        )}

        <table className="w-full table-fixed border-collapse text-left max-md:block">
          <colgroup>
            <col className="w-[26%]" />
            <col />
            <col className="w-[300px]" />
            <col className="w-[180px]" />
            <col className="w-14" />
          </colgroup>
          <thead className="max-md:hidden">
            <tr className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-semibold">
                <Trans>Task</Trans>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                <Trans>Prompts</Trans>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                <Trans>Model</Trans>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                <Trans>Reasoning effort</Trans>
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">
                  <Trans>Actions</Trans>
                </span>
              </th>
            </tr>
          </thead>

          {showDefault && (
            <tbody className="max-md:block">
              <tr
                id={SETTINGS_ANCHORS.defaultLlm}
                className={cn(
                  ROW,
                  "scroll-mt-24 border-t bg-brand-50/40 dark:bg-brand-500/5",
                  (llm.isDirty || tasks.isDefaultEffortDirty) && "bg-brand-50/80 dark:bg-brand-500/10",
                )}
              >
                <td className={CELL}>
                  <label htmlFor="app-default-model" className="flex items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15">
                      <Brain className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">
                        <Highlight text={defaultLabel} query={query} />
                      </span>
                      <span className="block text-pretty text-[11.5px] text-muted-foreground">
                        <Trans>Every text task falls back to this model unless it overrides it.</Trans>
                      </span>
                    </span>
                  </label>
                </td>
                <td className={cn(CELL, "text-[12px] tabular-nums text-muted-foreground")}>
                  <Plural value={inheritCount} one="# task inherits it" other="# tasks inherit it" />
                </td>
                <td className={CELL}>
                  <ModelSelect
                    inputId="app-default-model"
                    value={llm.draft}
                    onChange={llm.setDraft}
                    placeholder={DEFAULT_MODEL}
                    groups={llm.modelGroups}
                    inputClassName="h-9 font-mono text-[13px]"
                    disabled={llm.isLoading || llm.isSaving}
                    commitOnInput
                  />
                  <UnsupportedModelNotice support={llm.support} modality="text" className="mt-1.5" />
                </td>
                <td className={CELL}>
                  <EffortSelect
                    id="app-default-reasoning-effort"
                    label={t`Default reasoning effort`}
                    value={tasks.defaultEffort}
                    onChange={tasks.setDefaultEffort}
                    support={tasks.defaultModelEffortSupport}
                    inherited={undefined}
                    inheritLabel={t`Model default`}
                    problem={null}
                    disabled={tasks.busy}
                    anyModel
                  />
                </td>
                <td className={CELL} />
              </tr>
            </tbody>
          )}

          {tasks.isLoading && (
            <tbody className="max-md:block" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <tr key={index} className="border-t border-border/60 max-md:block">
                  <td colSpan={5} className="px-4 py-3 max-md:block">
                    <div className="h-8 animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
                  </td>
                </tr>
              ))}
            </tbody>
          )}

          {visibleGroups.map((group) => (
            <tbody key={group.stage} className="max-md:block">
              <GroupRow id={group.stage === tasks.groups[0]?.stage ? SETTINGS_ANCHORS.taskModels : undefined}>
                <Highlight text={group.label} query={query} />
              </GroupRow>
              {group.tasks.map((task) => {
                const label = tasks.labelOf(task)
                const custom = tasks.isCustom(task.id)
                const inputId = taskModelInputId(task.id)
                const effort = tasks.effortOf(task.id)
                const hint = inheritanceHint(task.id)
                return (
                  <tr
                    key={task.id}
                    className={cn(
                      ROW,
                      "border-t border-border/60 hover:bg-muted/25",
                      tasks.isDirty(task.id) && "bg-brand-50/50 hover:bg-brand-50/60 dark:bg-brand-500/5",
                    )}
                  >
                    <td className={CELL}>
                      <label htmlFor={inputId} className="flex items-center gap-2 text-[13px] font-medium">
                        <CustomModelDot active={custom} />
                        <span className="truncate">
                          <Highlight text={label} query={query} />
                        </span>
                      </label>
                    </td>
                    <td className={CELL}>
                      <PromptNames prompts={task.prompts} query={query} />
                    </td>
                    <td className={CELL}>
                      <ModelSelect
                        inputId={inputId}
                        value={tasks.draftOf(task.id)}
                        onChange={(value) => tasks.setDraft(task.id, value)}
                        placeholder={tasks.inheritedOf(task.id).model}
                        groups={llm.modelGroups}
                        inputClassName="h-9 font-mono text-[13px]"
                        disabled={tasks.busy}
                        commitOnInput
                      />
                      {hint && (
                        <p className="mt-1 text-pretty text-[11.5px] text-muted-foreground">{hint}</p>
                      )}
                      <UnsupportedModelNotice support={tasks.supportFor(task.id)} modality="text" className="mt-1.5" />
                    </td>
                    <td className={CELL}>
                      <EffortSelect
                        id={`${inputId}-effort`}
                        label={t`Reasoning effort for ${label}`}
                        value={effort.draft}
                        onChange={(value) => tasks.setEffort(task.id, value)}
                        support={effort.support}
                        inherited={effort.inherited}
                        problem={effort.problem}
                        disabled={tasks.busy}
                      />
                      <EffortProblemNotice
                        problem={effort.problem}
                        model={tasks.effectiveModelOf(task.id)}
                        effort={effort.draft}
                        className="mt-1.5"
                      />
                    </td>
                    <td className={cn(CELL, "text-right max-md:text-left")}>
                      <ResetToDefaultButton
                        visible={custom}
                        label={label}
                        disabled={tasks.busy}
                        onClick={() => tasks.setDraft(task.id, "")}
                        className="size-9"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ))}

          {visibleSpecialized.length > 0 && (
            <tbody className="max-md:block">
              <GroupRow>
                <Highlight text={specializedLabel} query={query} />
              </GroupRow>
              {visibleSpecialized.map((item, index) => (
                <tr
                  key={item.key}
                  id={item.anchorId}
                  className={cn(
                    ROW,
                    "scroll-mt-24 border-t border-border/60 hover:bg-muted/25",
                    index === visibleSpecialized.length - 1 &&
                      "[&>td:first-child]:rounded-bl-2xl [&>td:last-child]:rounded-br-2xl",
                  )}
                >
                  <td className={CELL}>
                    <label htmlFor={item.inputId} className="flex items-center gap-2.5">
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", item.tile)}>
                        <item.icon className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">
                          <Highlight text={item.title} query={query} />
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">{item.description}</span>
                      </span>
                    </label>
                  </td>
                  <td className={cn(CELL, "text-[12px] text-muted-foreground")}>
                    <Highlight text={item.usedBy.join(" · ")} query={query} />
                  </td>
                  <td className={CELL}>
                    <ModelSelect
                      inputId={item.inputId}
                      value={item.value}
                      onChange={item.onChange}
                      placeholder={item.placeholder}
                      groups={item.groups}
                      inputClassName="h-9 font-mono text-[13px]"
                      disabled={specialized.isLoading || specialized.isSaving}
                      commitOnInput
                      prefixProvider={item.prefixProvider}
                    />
                    <UnsupportedModelNotice support={item.support} modality="image" className="mt-1.5" />
                  </td>
                  <td className={cn(CELL, "text-[12.5px] text-muted-foreground")}>
                    <span aria-hidden="true">—</span>
                  </td>
                  <td className={CELL} />
                </tr>
              ))}
            </tbody>
          )}

          {query && shown === 0 && (
            <tbody className="max-md:block">
              <tr className="border-t max-md:block">
                <td colSpan={5} className="px-4 py-12 text-center max-md:block">
                  <p className="text-[13px] font-medium">
                    <Trans>No tasks, prompts or models match “{search}”.</Trans>
                  </p>
                  <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0" onClick={clearSearch}>
                    <Trans>Clear search</Trans>
                  </Button>
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </>
  )
}
