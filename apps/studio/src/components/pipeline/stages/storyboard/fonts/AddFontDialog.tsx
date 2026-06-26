import { useEffect, useRef, useState } from "react"
import { Loader2, Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { BookFontWithStatus } from "@/api/client"
import { useAddGoogleFont, useUploadBookFonts } from "@/hooks/use-book-fonts"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { GoogleFontPicker } from "../GoogleFontPickerDialog"

export function AddFontDialog({
  bookLabel,
  open,
  onOpenChange,
  fonts,
  onError,
}: {
  bookLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  fonts: BookFontWithStatus[]
  onError: (message: string) => void
}) {
  const { t } = useLingui()
  const [tab, setTab] = useState<"upload" | "google">("upload")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFonts = useUploadBookFonts(bookLabel)
  const addGoogleFont = useAddGoogleFont(bookLabel)

  useEffect(() => {
    if (open) setTab("upload")
  }, [open])

  const handleUpload = (files: FileList | File[] | null) => {
    const list = files ? [...files] : []
    if (list.length === 0) return
    uploadFonts.mutate(list, {
      onSuccess: () => {
        onOpenChange(false)
        toast.success(t`Fonts successfully uploaded.`)
      },
      onError: (err) => onError(err.message),
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddGoogle = (family: string) => {
    addGoogleFont.mutate(family, {
      onSuccess: () => {
        onOpenChange(false)
        toast.success(t`Google font added.`)
      },
      onError: (err) => onError(err.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t`Add new font`}</DialogTitle>
          <DialogDescription>
            <Trans>
              Upload your own font files or pick a Google Fonts family. Fonts are embedded in the
              final bundle so the book works offline.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "upload" | "google")}>
          <TabsList>
            <TabsTrigger value="upload">{t`Upload`}</TabsTrigger>
            <TabsTrigger value="google">{t`Google Fonts`}</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
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
                "flex min-h-[16rem] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                "hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                uploadFonts.isPending && "opacity-60 cursor-wait",
              )}
            >
              {uploadFonts.isPending ? (
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <Upload className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="text-sm font-medium">{t`Drag & drop font files here`}</span>
              <span className="text-xs text-muted-foreground">
                {t`or click to browse — TTF, OTF, WOFF, WOFF2 (max 15 MB)`}
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
          </TabsContent>
          <TabsContent value="google">
            <GoogleFontPicker
              active={open && tab === "google"}
              existingFamilies={
                new Set(fonts.filter((f) => f.source === "google").map((f) => f.family))
              }
              pendingFamily={addGoogleFont.isPending ? (addGoogleFont.variables ?? null) : null}
              onSelect={handleAddGoogle}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
