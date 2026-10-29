import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { BASE_URL, type PageDetail } from "@/api/client"
import { useSectionNav } from "@/routes/books.$label"
import { Button } from "@/components/ui/button"
import { ActivityActions } from "./ActivityActions"
import { useEditableActivities } from "@/hooks/use-editable-activities"

export function ActivityResults({ bookLabel, page, disabled, canRecreate, onDelete, onRecreate }: {
  bookLabel: string
  page: PageDetail
  disabled: boolean
  canRecreate: boolean
  onDelete: (sectionIndex: number) => Promise<unknown>
  onRecreate: (sectionIndex: number, feedback: string) => Promise<unknown>
}) {
  const { t } = useLingui()
  const { setSectionIndex, skipNextResetRef } = useSectionNav()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const editable = useEditableActivities(bookLabel, page.pageId)
  const activities = (page.sectioningTree?.sections ?? []).flatMap((section, sectionIndex) => {
    if (section.isPruned || !section.sectionType.startsWith("activity_")) return []
    if (!page.rendering?.sections.some((rendering) => rendering.sectionIndex === sectionIndex)) return []
    return [{ ...section, sectionIndex }]
  })
  const selected = activities.find((section) => section.sectionId === selectedId) ?? activities.at(-1)
  if (!selected) return <p className="text-sm text-muted-foreground">{t`No activities on this page yet. Generate an activity to get started.`}</p>
  const stepper = editable.data?.activities[String(selected.sectionIndex)]
  const isStepper = stepper?.enabled && stepper.sectionType === selected.sectionType

  return (
    <section className="space-y-3" aria-label={t`Activities on this page`}>
      <div className="flex flex-wrap items-center gap-2">
        {activities.map((activity, index) => (
          <button key={activity.sectionId} type="button" aria-pressed={activity.sectionId === selected.sectionId}
            disabled={disabled}
            onClick={() => setSelectedId(activity.sectionId)}
            className="min-h-11 rounded-md border px-4 text-sm aria-pressed:border-primary aria-pressed:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {t`Activity ${index + 1}`}
          </button>
        ))}
        <Link to="/books/$label/$step/$pageId" params={{ label: bookLabel, step: "storyboard", pageId: page.pageId }}
          onClick={() => { skipNextResetRef.current = true; setSectionIndex(selected.sectionIndex) }}
          className="ml-auto inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          {t`Edit activity`}
        </Link>
        <ActivityActions key={selected.sectionId} disabled={disabled}
          canRecreate={canRecreate && editable.isSuccess && !isStepper}
          onDelete={() => onDelete(selected.sectionIndex)}
          onRecreate={(feedback) => onRecreate(selected.sectionIndex, feedback)} />
      </div>
      {isStepper && <p className="text-sm text-muted-foreground">{t`Use the page editor to rebuild a step-by-step activity.`}</p>}
      {editable.isError && <p role="alert" className="text-sm text-destructive">{t`Could not load the activity settings.`} <Button variant="outline" onClick={() => { void editable.refetch() }}>{t`Try again`}</Button></p>}
      <iframe key={`${selected.sectionId}-${page.versions.rendering}`} title={t`Activity preview`}
        src={`${BASE_URL}/books/${encodeURIComponent(bookLabel)}/adt-preview/${encodeURIComponent(selected.sectionId)}.html?embed=1&v=${page.versions.rendering ?? 0}`}
        className="h-[65vh] min-h-96 w-full rounded-xl border bg-white" />
    </section>
  )
}
