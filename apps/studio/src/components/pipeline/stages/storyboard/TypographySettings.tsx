import { Fragment, useEffect, useMemo, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { DEFAULT_TYPOGRAPHY, type TypographyStyle } from "@adt/types"
import { Button } from "@/components/ui/button"
import { StepperInput } from "@/components/ui/stepper-input"
import { toast } from "@/components/ui/sonner"
import { useTypography, useUpdateTypography } from "@/hooks/use-typography"

const MIN_PX = 8
const MAX_PX = 200
// Keep the preview legible without letting a large value blow out the row.
const PREVIEW_MAX_PX = 44

/** Localized labels for the known style keys (falls back to the stored label). */
function useStyleLabel() {
  const { t } = useLingui()
  return (s: TypographyStyle): string => {
    switch (s.key) {
      case "chapter_title":
        return t`Chapter title`
      case "section_heading":
        return t`Section heading`
      case "subheading":
        return t`Subheading`
      case "body":
        return t`Body`
      case "caption":
        return t`Caption`
      default:
        return s.label
    }
  }
}

export function TypographySettings({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const styleLabel = useStyleLabel()
  const { data, isLoading } = useTypography(bookLabel)
  const update = useUpdateTypography(bookLabel)

  const [styles, setStyles] = useState<TypographyStyle[]>([])

  // Load the server value once; don't clobber in-progress edits on refetch.
  useEffect(() => {
    if (data?.data.styles && styles.length === 0) setStyles(data.data.styles)
  }, [data, styles.length])

  const dirty = useMemo(
    () => data != null && JSON.stringify(styles) !== JSON.stringify(data.data.styles),
    [styles, data],
  )

  const setMobile = (key: string, value: number | null) => {
    if (value == null) return
    setStyles((prev) => prev.map((s) => (s.key === key ? { ...s, mobilePx: value } : s)))
  }
  const setDesktop = (key: string, value: number | null) => {
    if (value == null) return
    setStyles((prev) => prev.map((s) => (s.key === key ? { ...s, desktopPx: value } : s)))
  }

  const handleSave = () => {
    // Clamp floor can't exceed the ceiling.
    const fixed = styles.map((s) => ({ ...s, mobilePx: Math.min(s.mobilePx, s.desktopPx) }))
    update.mutate(
      { styles: fixed },
      {
        onSuccess: () => {
          setStyles(fixed)
          toast.success(t`Text sizes saved. Re-run Storyboard and Export to apply them.`)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <Trans>Loading text sizes…</Trans>
      </div>
    )
  }

  return (
    <div className="border-t pt-6">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        <Trans>Text sizes</Trans>
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        <Trans>
          Fixed, accessible sizes applied to every page. Each role scales fluidly between its
          mobile and desktop size, and these override any size the AI picks — so headings and
          body text stay consistent across the whole book.
        </Trans>
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_minmax(0,1.4fr)] items-center gap-x-3 gap-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>Style</Trans>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>Mobile</Trans>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>Desktop</Trans>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>Preview</Trans>
        </div>

        {styles.map((s) => {
          const label = styleLabel(s)
          return (
            <Fragment key={s.key}>
              <div className="text-sm">{label}</div>
              <StepperInput
                value={s.mobilePx}
                onChange={(v) => setMobile(s.key, v)}
                min={MIN_PX}
                max={MAX_PX}
                step={1}
                decrementLabel={t`Decrease ${label} mobile size`}
                incrementLabel={t`Increase ${label} mobile size`}
                aria-label={t`${label} mobile size in pixels`}
              />
              <StepperInput
                value={s.desktopPx}
                onChange={(v) => setDesktop(s.key, v)}
                min={MIN_PX}
                max={MAX_PX}
                step={1}
                decrementLabel={t`Decrease ${label} desktop size`}
                incrementLabel={t`Increase ${label} desktop size`}
                aria-label={t`${label} desktop size in pixels`}
              />
              <div className="overflow-hidden">
                <span
                  className="block truncate leading-tight"
                  style={{ fontSize: `${Math.min(s.desktopPx, PREVIEW_MAX_PX)}px` }}
                >
                  {label}
                </span>
              </div>
            </Fragment>
          )
        })}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setStyles(DEFAULT_TYPOGRAPHY.styles)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {t`Reset to defaults`}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {t`Save text sizes`}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <Trans>Changes apply the next time you run Storyboard and Export.</Trans>
      </p>
    </div>
  )
}
