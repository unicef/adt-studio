import { Fragment, useEffect, useMemo, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { DEFAULT_TYPOGRAPHY, type TypographyStyle } from "@adt/types"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { useTypography, useUpdateTypography } from "@/hooks/use-typography"
import { TokenInput } from "./components/style-editor/controls/TokenInput"
import { FONT_SIZE_TOKEN_LIST } from "./components/style-editor/class-maps"

const MIN_PX = 8
const MAX_PX = 200
// Keep the preview legible without letting a large value blow out the row.
const PREVIEW_MAX_PX = 44

const clampPx = (v: number) => Math.max(MIN_PX, Math.min(MAX_PX, Math.round(v)))

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

  const setMobile = (key: string, value: number) => {
    setStyles((prev) => prev.map((s) => (s.key === key ? { ...s, mobilePx: clampPx(value) } : s)))
  }
  const setDesktop = (key: string, value: number) => {
    setStyles((prev) => prev.map((s) => (s.key === key ? { ...s, desktopPx: clampPx(value) } : s)))
  }

  const handleSave = () => {
    // Clamp floor can't exceed the ceiling.
    const fixed = styles.map((s) => ({ ...s, mobilePx: Math.min(s.mobilePx, s.desktopPx) }))
    update.mutate(
      { styles: fixed },
      {
        onSuccess: () => {
          setStyles(fixed)
          toast.success(t`Text sizes saved.`)
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
          One text scale for the whole book. It starts from the book's own detected sizes (never
          below 16px), so pages stay close to the original. Use “Accessible sizes” to scale the
          book up, or set each role yourself — pick a Tailwind token or type an exact px. These
          override any size the AI picks, so text stays consistent across every page.
        </Trans>
      </p>

      <div className="grid grid-cols-[minmax(5.5rem,1fr)_8.5rem_8.5rem_minmax(0,1.1fr)] items-center gap-x-3 gap-y-3">
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
              <div role="group" aria-label={t`${label} mobile size`}>
                <TokenInput
                  value={s.mobilePx}
                  onChange={(v) => setMobile(s.key, v)}
                  tokens={FONT_SIZE_TOKEN_LIST}
                  suffix="px"
                  renderPreview={(tok) => (
                    <span style={{ fontSize: Math.min(tok.value, 22) }}>{t`Aa`}</span>
                  )}
                />
              </div>
              <div role="group" aria-label={t`${label} desktop size`}>
                <TokenInput
                  value={s.desktopPx}
                  onChange={(v) => setDesktop(s.key, v)}
                  tokens={FONT_SIZE_TOKEN_LIST}
                  suffix="px"
                  renderPreview={(tok) => (
                    <span style={{ fontSize: Math.min(tok.value, 22) }}>{t`Aa`}</span>
                  )}
                />
              </div>
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (data?.detected.styles) setStyles(data.detected.styles)
          }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {t`Reset to detected`}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setStyles(DEFAULT_TYPOGRAPHY.styles)}>
          {t`Accessible sizes`}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {t`Save text sizes`}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <Trans>Text sizes apply immediately here — re-export to include them in a downloaded book.</Trans>
      </p>
    </div>
  )
}
