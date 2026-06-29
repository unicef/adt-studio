import { Trash2, Type } from "lucide-react"
import { type BookFontRole, type FontAssignmentOutput } from "@adt/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BookFontWithStatus } from "@/api/client"
import { useApplyBookFont, useDeleteBookFont, useUpdateBookFont } from "@/hooks/use-book-fonts"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { licenseStatus, previewFamily, useRoleLabels } from "./font-utils"
import { FontLicenseWarning } from "./FontLicenseWarning"

const WHOLE_BOOK_VALUE = "whole-book"

export function AttachedFontsList({
  bookLabel,
  fonts,
  assignment,
  isLoading,
  onError,
  onApplied,
}: {
  bookLabel: string
  fonts: BookFontWithStatus[]
  assignment: FontAssignmentOutput | null | undefined
  isLoading: boolean
  onError: (message: string) => void
  onApplied: (message: string) => void
}) {
  const { t } = useLingui()
  const roleLabels = useRoleLabels()
  const updateFont = useUpdateBookFont(bookLabel)
  const deleteFont = useDeleteBookFont(bookLabel)
  const applyFont = useApplyBookFont(bookLabel)
  const sampleText = t`The quick brown fox jumps over the lazy dog 0123456789`

  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
        <div className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
      </div>
    )
  }

  if (fonts.length === 0) {
    return (
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
    )
  }

  return (
    <ul className="space-y-3">
      {fonts.map((font) => {
        const usageNotes = assignment?.assignments.find((a) => a.font_id === font.id)?.usage_notes
        const canPreview = font.cached || font.source === "google"
        return (
          <li key={font.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className="text-xl leading-snug truncate"
                  style={
                    canPreview ? { fontFamily: previewFamily(font.family, font.category) } : undefined
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
              {licenseStatus(font) === "open" && (
                <Badge variant="secondary">{t`Open-source license`}</Badge>
              )}
              {licenseStatus(font) === "restricted" && (
                <Badge variant="destructive">{t`Restricted license`}</Badge>
              )}
              {licenseStatus(font) === "unverified" && (
                <Badge variant="outline">{t`Unverified license`}</Badge>
              )}
              {font.faces.length > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  {t`Weights:`}{" "}
                  {[...new Set(font.faces.map((f) => f.weight))].sort((a, b) => a - b).join(", ")}
                  {font.faces.some((f) => f.style === "italic") ? ` · ${t`italic`}` : ""}
                </span>
              )}
            </div>

            <FontLicenseWarning font={font} />

            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">{t`Used for`}</Label>
              <Select
                value={font.role === "body" ? WHOLE_BOOK_VALUE : font.role}
                onValueChange={(value) => {
                  if (value === WHOLE_BOOK_VALUE) {
                    applyFont.mutate(
                      { scope: "whole", font: { kind: "registry", id: font.id } },
                      {
                        onSuccess: () =>
                          onApplied(t`Your font has been applied to the whole book.`),
                        onError: (err) => onError(err.message),
                      },
                    )
                    return
                  }
                  if (value === "heading" || value === "paragraph" || value === "caption") {
                    applyFont.mutate(
                      { scope: value, font: { kind: "registry", id: font.id } },
                      {
                        onSuccess: () =>
                          onApplied(
                            value === "heading"
                              ? t`Your font has been applied to headings.`
                              : value === "paragraph"
                                ? t`Your font has been applied to paragraphs.`
                              : t`Your font has been applied to captions.`,
                          ),
                        onError: (err) => onError(err.message),
                      },
                    )
                    return
                  }
                  updateFont.mutate({
                    fontId: font.id,
                    role: value as BookFontRole,
                    roleLockedByUser: true,
                  })
                }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_BOOK_VALUE} className="text-xs">
                    {t`Whole book`}
                  </SelectItem>
                  {(Object.keys(roleLabels) as BookFontRole[])
                    .filter((role) => role !== "body")
                    .map((role) => (
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
  )
}
