import { useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ValidationFixStage, type ReviewerValidationSection } from "@adt/types"
import { ListChecks, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useReviewerValidationCatalog } from "@/hooks/use-reviewer-validation"
import { cn } from "@/lib/utils"
import { STAGE_LABEL_MESSAGES } from "@/components/pipeline/pipeline-i18n"

interface EditableCriterion {
  id: string
  label: string
  guidance: string
  requires_comment_on_failure: boolean
  requires_suggested_modification_on_failure: boolean
  fix_stage?: ValidationFixStage
  enabled: boolean
}

const AUTOMATIC_FIX_STAGE = "__automatic__"
const INHERIT_FIX_STAGE = "__inherit__"

function FixStageSelect({
  value,
  fallback,
  onValueChange,
}: {
  value?: ValidationFixStage
  fallback: "automatic" | "inherit"
  onValueChange: (value: ValidationFixStage | undefined) => void
}) {
  const { t, i18n } = useLingui()
  const fallbackValue = fallback === "automatic" ? AUTOMATIC_FIX_STAGE : INHERIT_FIX_STAGE

  return (
    <Select
      value={value ?? fallbackValue}
      onValueChange={(next) => onValueChange(
        next === AUTOMATIC_FIX_STAGE || next === INHERIT_FIX_STAGE
          ? undefined
          : ValidationFixStage.parse(next),
      )}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={fallbackValue} className="text-xs">
          {fallback === "automatic" ? t`Automatic routing` : t`Use section destination`}
        </SelectItem>
        {ValidationFixStage.options.map((stage) => (
          <SelectItem key={stage} value={stage} className="text-xs">
            {i18n._(STAGE_LABEL_MESSAGES[stage])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface EditableSection {
  id: string
  label: string
  fix_stage?: ValidationFixStage
  enabled: boolean
  criteria: EditableCriterion[]
}

const SECTION_ACCENT_STYLES = [
  {
    stripe: "bg-emerald-500/85",
    sectionBorder: "border-l-4 border-l-emerald-500/85",
    header: "bg-emerald-50/80 dark:bg-emerald-950/20",
    surface: "bg-emerald-50/30 dark:bg-emerald-950/10",
  },
  {
    stripe: "bg-sky-500/85",
    sectionBorder: "border-l-4 border-l-sky-500/85",
    header: "bg-sky-50/80 dark:bg-sky-950/20",
    surface: "bg-sky-50/30 dark:bg-sky-950/10",
  },
  {
    stripe: "bg-violet-500/85",
    sectionBorder: "border-l-4 border-l-violet-500/85",
    header: "bg-violet-50/80 dark:bg-violet-950/20",
    surface: "bg-violet-50/30 dark:bg-violet-950/10",
  },
  {
    stripe: "bg-amber-500/85",
    sectionBorder: "border-l-4 border-l-amber-500/85",
    header: "bg-amber-50/80 dark:bg-amber-950/20",
    surface: "bg-amber-50/30 dark:bg-amber-950/10",
  },
] as const

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "custom-item"
}

function toEditableSections(sections: ReviewerValidationSection[]): EditableSection[] {
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    fix_stage: section.fix_stage,
    enabled: true,
    criteria: section.criteria.map((criterion) => ({
      ...criterion,
      enabled: true,
    })),
  }))
}

function serializeSections(sections: EditableSection[], defaultGuidance: string): ReviewerValidationSection[] {
  return sections
    .filter((section) => section.enabled)
    .map((section) => ({
      id: section.id,
      label: section.label.trim() || section.id,
      fix_stage: section.fix_stage,
      criteria: section.criteria
        .filter((criterion) => criterion.enabled)
        .map((criterion) => ({
          id: criterion.id,
          label: criterion.label.trim() || criterion.id,
          guidance: criterion.guidance.trim() || defaultGuidance,
          fix_stage: criterion.fix_stage,
          requires_comment_on_failure: criterion.requires_comment_on_failure,
          requires_suggested_modification_on_failure: criterion.requires_suggested_modification_on_failure,
        })),
    }))
    .filter((section) => section.criteria.length > 0)
}

function SectionHeader({ title, description }: { title: React.ReactNode; description: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

export function ReviewerChecklistSettingsTab({ label }: { label: string }) {
  const { t } = useLingui()
  const { data: catalogData, isLoading, error } = useReviewerValidationCatalog(label)
  const { data: bookConfigData } = useBookConfig(label)
  const updateConfig = useUpdateBookConfig()
  const [sections, setSections] = useState<EditableSection[]>([])
  const [dirty, setDirty] = useState(false)
  const reviewerValidationConfig = (bookConfigData?.config?.reviewer_validation ?? null) as Record<string, unknown> | null
  const reviewerValidationEnabled = catalogData?.enabled ?? false

  useEffect(() => {
    if (!catalogData || dirty) {
      return
    }

    setSections(toEditableSections(catalogData.pageSections))
  }, [catalogData, dirty])

  const hasOverride = useMemo(() => {
    return Boolean(
      reviewerValidationConfig && (
        Array.isArray(reviewerValidationConfig.sections) || typeof reviewerValidationConfig.enabled === "boolean"
      ),
    )
  }, [reviewerValidationConfig])

  const enabledCriteriaCount = useMemo(
    () => sections.reduce((total, section) => total + section.criteria.filter((criterion) => criterion.enabled).length, 0),
    [sections],
  )

  const updateReviewerValidationConfig = (mutator: (reviewerValidation: Record<string, unknown>) => void) => {
    const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<string, unknown>
    const reviewerValidation = currentConfig.reviewer_validation && typeof currentConfig.reviewer_validation === "object"
      ? { ...(currentConfig.reviewer_validation as Record<string, unknown>) }
      : {}

    mutator(reviewerValidation)

    if (Object.keys(reviewerValidation).length > 0) {
      currentConfig.reviewer_validation = reviewerValidation
    } else {
      delete currentConfig.reviewer_validation
    }

    updateConfig.mutate({ label, config: currentConfig })
  }

  const setReviewerValidationEnabled = (enabled: boolean) => {
    updateReviewerValidationConfig((reviewerValidation) => {
      reviewerValidation.enabled = enabled
    })
  }

  const setSection = (sectionId: string, updater: (section: EditableSection) => EditableSection) => {
    setSections((current) => current.map((section) => (section.id === sectionId ? updater(section) : section)))
    setDirty(true)
  }

  const setCriterion = (
    sectionId: string,
    criterionId: string,
    updater: (criterion: EditableCriterion) => EditableCriterion,
  ) => {
    setSection(sectionId, (section) => ({
      ...section,
      criteria: section.criteria.map((criterion) => (criterion.id === criterionId ? updater(criterion) : criterion)),
    }))
  }

  const addSection = () => {
    const index = sections.length + 1
    setSections((current) => [
      ...current,
      {
        id: `custom-section-${index}`,
        label: t`Custom section ${index}`,
        fix_stage: "storyboard",
        enabled: true,
        criteria: [
          {
            id: `custom-criterion-${index}-1`,
            label: t`New checklist item`,
            guidance: t`Describe what the reviewer should check.`,
            requires_comment_on_failure: true,
            requires_suggested_modification_on_failure: false,
            enabled: true,
          },
        ],
      },
    ])
    setDirty(true)
  }

  const addCriterion = (sectionId: string) => {
    setSection(sectionId, (section) => {
      const index = section.criteria.length + 1
      return {
        ...section,
        criteria: [
          ...section.criteria,
          {
            id: `${section.id}-criterion-${index}`,
            label: t`New checklist item`,
            guidance: t`Describe what the reviewer should check.`,
            requires_comment_on_failure: true,
            requires_suggested_modification_on_failure: false,
            enabled: true,
          },
        ],
      }
    })
  }

  const removeSection = (sectionId: string) => {
    setSections((current) => current.filter((section) => section.id !== sectionId))
    setDirty(true)
  }

  const removeCriterion = (sectionId: string, criterionId: string) => {
    setSection(sectionId, (section) => ({
      ...section,
      criteria: section.criteria.filter((criterion) => criterion.id !== criterionId),
    }))
  }

  const saveChecklist = () => {
    updateReviewerValidationConfig((reviewerValidation) => {
      reviewerValidation.sections = serializeSections(sections, t`Add reviewer guidance.`)
    })
    setDirty(false)
  }

  const resetChecklist = () => {
    updateReviewerValidationConfig((reviewerValidation) => {
      delete reviewerValidation.sections
    })
    setDirty(false)
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground"><Trans>Loading reviewer checklist…</Trans></div>
  }

  if (error || !catalogData) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : t`Unable to load reviewer checklist settings.`}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      <SectionHeader
        title={t`Reviewer checklist`}
        description={t`Choose which per-page validation items reviewers must check, customize the wording and guidance, and add your own checklist items for this document.`}
      />

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground"><Trans>Reviewer validation checklist</Trans></div>
            <p className="text-sm text-muted-foreground">
              <Trans>Enable or disable reviewer-authored checklist reviews for this book. Automated accessibility assessment remains available either way.</Trans>
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/20">
            <Switch
              checked={reviewerValidationEnabled}
              onCheckedChange={setReviewerValidationEnabled}
              aria-label={reviewerValidationEnabled ? t`Disable reviewer validation` : t`Enable reviewer validation`}
            />
            <span>
              {reviewerValidationEnabled ? <Trans>Enabled</Trans> : <Trans>Disabled</Trans>}
            </span>
          </label>
        </div>
      </div>

      {!reviewerValidationEnabled ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20">
          <p className="font-medium text-foreground"><Trans>Reviewer checklist reviews are currently disabled.</Trans></p>
          <p className="mt-2">
            <Trans>Turn this on to show the Validation review card in Preview and the Reviewer Validation tab in the Validation step.</Trans>
          </p>
        </div>
      ) : null}

      {reviewerValidationEnabled ? (
        <>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {sections.filter((section) => section.enabled).length} <Trans>active sections</Trans> · {enabledCriteriaCount} <Trans>active checklist items</Trans>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addSection}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              <Trans>Add section</Trans>
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={saveChecklist} disabled={updateConfig.isPending}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              <Trans>Save checklist</Trans>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetChecklist} disabled={updateConfig.isPending || !hasOverride}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              <Trans>Reset to inherited defaults</Trans>
            </Button>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          <Trans>Existing reviewer sessions keep their own checklist snapshot. New checklist changes apply to newly created sessions.</Trans>
        </div>

        {updateConfig.isSuccess ? (
          <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400"><Trans>Reviewer checklist settings saved.</Trans></div>
        ) : null}
        {updateConfig.isError ? (
          <div className="mt-3 text-xs text-red-700">{updateConfig.error.message}</div>
        ) : null}
      </div>

      <div className="space-y-4">
        {sections.map((section, sectionIndex) => {
          const activeCriteriaCount = section.criteria.filter((criterion) => criterion.enabled).length
          const accent = SECTION_ACCENT_STYLES[sectionIndex % SECTION_ACCENT_STYLES.length]

          return (
            <div
              key={section.id}
              className={cn(
                "overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm dark:border-slate-800",
                accent.sectionBorder,
                !section.enabled && "opacity-70",
              )}
            >
              <div className={cn("relative border-b px-4 py-2.5", accent.header)}>
                <div className={cn("absolute inset-y-0 left-0 w-1.5", accent.stripe)} />
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="min-w-[16rem] flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={section.enabled}
                          onCheckedChange={(checked) => setSection(section.id, (current) => ({ ...current, enabled: checked }))}
                          aria-label={t`Enable ${section.label}`}
                        />
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <ListChecks className="h-4 w-4 text-slate-500" />
                          <Trans>Section {sectionIndex + 1}</Trans>
                        </div>
                      </div>

                      <Badge variant={section.enabled ? "secondary" : "outline"}>
                         {activeCriteriaCount} {activeCriteriaCount === 1 ? t`active item` : t`active items`}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {section.id}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`${section.id}-label`}><Trans>Section label</Trans></Label>
                      <Input
                        id={`${section.id}-label`}
                        value={section.label}
                        onChange={(event) => {
                          const nextLabel = event.target.value
                          setSection(section.id, (current) => ({
                            ...current,
                            label: nextLabel,
                            id: current.id.startsWith("custom-section-") ? slugify(nextLabel || `custom-section-${sectionIndex + 1}`) : current.id,
                            criteria: current.criteria.map((criterion, criterionIndex) => ({
                              ...criterion,
                              id: criterion.id.startsWith(`${current.id}-criterion-`) ? `${slugify(nextLabel || `custom-section-${sectionIndex + 1}`)}-criterion-${criterionIndex + 1}` : criterion.id,
                            })),
                          }))
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label><Trans>Fix destination</Trans></Label>
                      <FixStageSelect
                        value={section.fix_stage}
                        fallback="automatic"
                        onValueChange={(fixStage) => setSection(section.id, (current) => ({
                          ...current,
                          fix_stage: fixStage,
                        }))}
                      />
                    </div>
                  </div>

                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeSection(section.id)} title={t`Remove section`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className={cn("space-y-2 px-4 py-3", accent.surface)}>
                {section.criteria.map((criterion, criterionIndex) => (
                  <div
                    key={criterion.id}
                    className={cn(
                      "relative overflow-hidden rounded-xl border border-slate-200 bg-background/95 shadow-sm dark:border-slate-800",
                      !criterion.enabled && "opacity-70",
                    )}
                  >
                    <div className={cn("absolute inset-y-1.5 left-0 w-1 rounded-r-sm opacity-70", accent.stripe)} />
                    <div className="px-4 py-2.5 pl-5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Switch
                              checked={criterion.enabled}
                              onCheckedChange={(checked) => setCriterion(section.id, criterion.id, (current) => ({ ...current, enabled: checked }))}
                              aria-label={t`Enable ${criterion.label}`}
                            />
                            <Badge variant={criterion.enabled ? "secondary" : "outline"}>
<Trans>Item {criterionIndex + 1}</Trans>
                            </Badge>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {criterion.id}
                            </Badge>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor={`${criterion.id}-label`}><Trans>Checklist item</Trans></Label>
                            <Input
                              id={`${criterion.id}-label`}
                              value={criterion.label}
                              onChange={(event) => setCriterion(section.id, criterion.id, (current) => ({
                                ...current,
                                label: event.target.value,
                                id: current.id.includes("criterion-") && current.id.startsWith(`${section.id}-criterion-`)
                                  ? `${section.id}-criterion-${criterionIndex + 1}`
                                  : current.id,
                              }))}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label><Trans>Fix destination</Trans></Label>
                            <FixStageSelect
                              value={criterion.fix_stage}
                              fallback="inherit"
                              onValueChange={(fixStage) => setCriterion(section.id, criterion.id, (current) => ({
                                ...current,
                                fix_stage: fixStage,
                              }))}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor={`${criterion.id}-guidance`}><Trans>Reviewer guidance</Trans></Label>
                            <Textarea
                              id={`${criterion.id}-guidance`}
                              value={criterion.guidance}
                              onChange={(event) => setCriterion(section.id, criterion.id, (current) => ({ ...current, guidance: event.target.value }))}
                              className="min-h-20 text-xs leading-relaxed"
                            />
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/20">
                              <Switch
                                checked={criterion.requires_comment_on_failure}
                                onCheckedChange={(checked) => setCriterion(section.id, criterion.id, (current) => ({ ...current, requires_comment_on_failure: checked }))}
                              />
                              <span><Trans>Require comment on failure</Trans></span>
                            </label>
                            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/20">
                              <Switch
                                checked={criterion.requires_suggested_modification_on_failure}
                                onCheckedChange={(checked) => setCriterion(section.id, criterion.id, (current) => ({ ...current, requires_suggested_modification_on_failure: checked }))}
                              />
                              <span><Trans>Require suggested modification</Trans></span>
                            </label>
                          </div>
                        </div>

                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCriterion(section.id, criterion.id)} title={t`Remove checklist item`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-0.5">
                  <Button variant="outline" size="sm" className="h-8 text-xs bg-background" onClick={() => addCriterion(section.id)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    <Trans>Add checklist item to this section</Trans>
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
        </>
      ) : null}
    </div>
  )
}
