import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  CloudDownload,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react"
import { GOOGLE_FONTS, googleFontsCss2Url, type BookFontRole } from "@adt/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  getBookFontFileUrl,
  type BookCurrentFont,
  type BookFontWithStatus,
} from "@/api/client"
import {
  useAddGoogleFont,
  useAnalyzeBookFonts,
  useBookFonts,
  useDeleteBookFont,
  useUpdateBookFont,
  useUploadBookFonts,
} from "@/hooks/use-book-fonts"
import { useApiKey } from "@/hooks/use-api-key"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"

const ANALYZE_POLL_MS = 3000

const GENERIC_FALLBACK: Record<string, string> = {
  serif: "serif",
  sans: "sans-serif",
  handwriting: "cursive",
  mono: "monospace",
  display: "sans-serif",
}

function useRoleLabels(): Record<BookFontRole, string> {
  const { t } = useLingui()
  return {
    heading: t`Headings`,
    body: t`Body text`,
    caption: t`Captions`,
    decorative: t`Decorative`,
    mono: t`Monospace`,
    unassigned: t`Unassigned`,
  }
}

function FontPreviewStyles({ label, fonts }: { label: string; fonts: BookFontWithStatus[] }) {
  /* eslint-disable lingui/no-unlocalized-strings -- CSS, not user-visible text */
  const css = useMemo(
    () =>
      fonts
        .filter((f) => f.cached)
        .flatMap((f) =>
          f.faces.map(
            (face) => `@font-face {
  font-family: ${JSON.stringify(f.family)};
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url(${JSON.stringify(getBookFontFileUrl(label, f.id, face.file))});
  ${face.unicodeRange ? `unicode-range: ${face.unicodeRange};` : ""}
}`,
          ),
        )
        .join("\n"),
    [label, fonts],
  )
  /* eslint-enable lingui/no-unlocalized-strings */
  if (!css) return null
  return <style>{css}</style>
}

function GooglePreviewLink({
  current,
  fonts,
}: {
  current: BookCurrentFont | undefined
  fonts: BookFontWithStatus[]
}) {
  const families: string[] = []
  if (current && !current.fixedLayout) families.push(current.font.family)
  for (const f of fonts) {
    if (f.source === "google" && !f.cached) families.push(f.family)
  }
  const url = googleFontsCss2Url(families)
  if (!url) return null
  return <link rel="stylesheet" href={url} />
}

function previewFamily(family: string, category?: string | null): string {
  return `'${family}', ${GENERIC_FALLBACK[category ?? "sans"] ?? "sans-serif"}`
}

function CurrentFontCard({ current }: { current: BookCurrentFont }) {
  const { t } = useLingui()
  if (current.fixedLayout) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-medium">{t`Current book font`}</h4>
          <Badge variant="secondary">{t`Fixed layout`}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          <Trans>
            This book renders fixed-layout, so it keeps the original PDF fonts. Attached fonts
            still guide the AI for activities and generated pages.
          </Trans>
        </p>
      </div>
    )
  }

  const detectedLabel =
    current.detectedCategory === "serif"
      ? t`serif`
      : current.detectedCategory === "sans"
        ? t`sans serif`
        : null

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-medium">{t`Current book font`}</h4>
        {current.setting === "auto" ? (
          <Badge variant="secondary">
            {detectedLabel
              ? t`Auto-detected · ${detectedLabel}`
              : t`Default (no text detected yet)`}
          </Badge>
        ) : (
          <Badge variant="secondary">{t`Set manually`}</Badge>
        )}
      </div>
      <p
        className="text-2xl leading-snug truncate"
        style={{ fontFamily: previewFamily(current.font.family, current.font.category) }}
        title={current.font.family}
      >
        {current.font.family}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        <Trans>
          Body text uses this font today. Attach a font below and assign it the “Body text” role
          to replace it in generated pages.
        </Trans>
      </p>
    </div>
  )
}

export function FontSettings({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const roleLabels = useRoleLabels()
  const { apiKey, hasApiKey } = useApiKey()

  const [analyzing, setAnalyzing] = useState(false)
  const [googleFamily, setGoogleFamily] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useBookFonts(bookLabel, {
    refetchInterval: analyzing ? ANALYZE_POLL_MS : false,
  })
  const uploadFonts = useUploadBookFonts(bookLabel)
  const addGoogleFont = useAddGoogleFont(bookLabel)
  const updateFont = useUpdateBookFont(bookLabel)
  const deleteFont = useDeleteBookFont(bookLabel)
  const analyzeFonts = useAnalyzeBookFonts(bookLabel)

  const fonts = data?.fonts ?? []
  const assignment = data?.assignment

  const allAssigned = fonts.length > 0 && fonts.every((f) => f.role !== "unassigned")
  useEffect(() => {
    if (analyzing && allAssigned) setAnalyzing(false)
  }, [analyzing, allAssigned])

  const handleUpload = (files: FileList | File[] | null) => {
    const list = files ? [...files] : []
    if (list.length === 0) return
    setActionError(null)
    uploadFonts.mutate(list, {
      onError: (err) => setActionError(err.message),
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddGoogle = () => {
    const family = googleFamily.trim()
    if (!family) return
    setActionError(null)
    addGoogleFont.mutate(family, {
      onSuccess: () => setGoogleFamily(""),
      onError: (err) => setActionError(err.message),
    })
  }

  const handleAnalyze = () => {
    setActionError(null)
    analyzeFonts.mutate(apiKey, {
      onSuccess: () => setAnalyzing(true),
      onError: (err) => setActionError(err.message),
    })
  }

  const sampleText = t`The quick brown fox jumps over the lazy dog 0123456789`

  return (
    <div className="space-y-6 max-w-3xl">
      <FontPreviewStyles label={bookLabel} fonts={fonts} />
      <GooglePreviewLink current={data?.current} fonts={fonts} />

      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          <Trans>Book Fonts</Trans>
        </h3>
        <p className="text-xs text-muted-foreground">
          <Trans>
            Attach font files or pick Google Fonts for this book. The AI assigns where each font
            is used (headings, body text, captions…) and the fonts are embedded in the final
            bundle so it works offline. Google Fonts are downloaded when extraction runs. Make
            sure you have the right to embed any uploaded font.
          </Trans>
        </p>
      </div>

      {data?.current && <CurrentFontCard current={data.current} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleUpload(e.dataTransfer.files)
          }}
          disabled={uploadFonts.isPending}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-5 text-center transition-colors",
            "hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            uploadFonts.isPending && "opacity-60 cursor-wait",
          )}
        >
          {uploadFonts.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm font-medium">{t`Upload font files`}</span>
          <span className="text-xs text-muted-foreground">
            {t`Drag & drop or click — TTF, OTF, WOFF, WOFF2 (max 15 MB)`}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            multiple
            className="hidden"
            tabIndex={-1}
            onChange={(e) => handleUpload(e.target.files)}
          />
        </button>

        <div className="flex flex-col justify-center gap-2 rounded-lg border p-4">
          <Label htmlFor="google-font-family" className="text-xs flex items-center gap-1.5">
            <CloudDownload className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {t`Add a Google Fonts family`}
          </Label>
          <div className="flex gap-2">
            <Input
              id="google-font-family"
              list="google-fonts-families"
              value={googleFamily}
              onChange={(e) => setGoogleFamily(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGoogle()
              }}
              placeholder={t`e.g. Lexend`}
              className="h-9"
            />
            <datalist id="google-fonts-families">
              {GOOGLE_FONTS.map((f) => (
                <option key={f.key} value={f.family} />
              ))}
            </datalist>
            <Button
              variant="secondary"
              size="sm"
              className="h-9 shrink-0"
              onClick={handleAddGoogle}
              disabled={addGoogleFont.isPending || !googleFamily.trim()}
            >
              {addGoogleFont.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t`Add`}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t`Downloaded automatically when extraction runs — the final bundle works offline.`}
          </p>
        </div>
      </div>

      {actionError && (
        <p className="text-xs text-destructive" role="alert">
          {actionError}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Trans>Attached fonts</Trans>
            {fonts.length > 0 && (
              <span className="ml-1.5 text-muted-foreground/70">({fonts.length})</span>
            )}
          </h4>
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={!hasApiKey || fonts.length === 0 || analyzeFonts.isPending || analyzing}
          >
            {analyzing || analyzeFonts.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {analyzing ? t`Analyzing...` : t`Analyze with AI`}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
            <div className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
          </div>
        ) : fonts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Type className="h-6 w-6 text-muted-foreground/60 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              <Trans>No fonts attached yet.</Trans>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              <Trans>
                The book keeps using the current font above until you attach and assign new ones.
              </Trans>
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {fonts.map((font) => {
              const usageNotes = assignment?.assignments.find(
                (a) => a.font_id === font.id,
              )?.usage_notes
              const canPreview = font.cached || font.source === "google"
              return (
                <li key={font.id} className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xl leading-snug truncate"
                        style={
                          canPreview
                            ? { fontFamily: previewFamily(font.family, font.category) }
                            : undefined
                        }
                        title={font.family}
                      >
                        {font.family}
                      </p>
                      {canPreview && (
                        <p
                          className="text-sm text-muted-foreground/90 truncate"
                          style={{ fontFamily: previewFamily(font.family, font.category) }}
                        >
                          {sampleText}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteFont.mutate(font.id)}
                      disabled={deleteFont.isPending}
                      aria-label={t`Remove font ${font.family}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {font.source === "google" ? t`Google Fonts` : t`Upload`}
                    </Badge>
                    {font.source === "google" && (
                      <Badge variant={font.cached ? "secondary" : "outline"}>
                        {font.cached ? t`Downloaded` : t`Downloads at extraction`}
                      </Badge>
                    )}
                    {font.roleLockedByUser && <Badge variant="outline">{t`Pinned`}</Badge>}
                    {font.faces.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {t`Weights:`}{" "}
                        {[...new Set(font.faces.map((f) => f.weight))]
                          .sort((a, b) => a - b)
                          .join(", ")}
                        {font.faces.some((f) => f.style === "italic") ? ` · ${t`italic`}` : ""}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">{t`Used for`}</Label>
                    <Select
                      value={font.role}
                      onValueChange={(role) =>
                        updateFont.mutate({
                          fontId: font.id,
                          role: role as BookFontRole,
                          roleLockedByUser: true,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(roleLabels) as BookFontRole[]).map((role) => (
                          <SelectItem key={role} value={role} className="text-xs">
                            {roleLabels[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {usageNotes && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
                      {usageNotes}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {assignment && (
        <details className="rounded-lg border bg-muted/40 group">
          <summary className="flex cursor-pointer items-center gap-2 p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider select-none">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <Trans>AI analysis reasoning</Trans>
            <ChevronDown
              className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {assignment.reasoning}
          </p>
        </details>
      )}

      {fonts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <Trans>
            Changing fonts affects how pages are rendered — re-run Storyboard and Export to apply
            the new fonts.
          </Trans>
        </p>
      )}
    </div>
  )
}
