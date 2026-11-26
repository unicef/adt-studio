import { useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ArrowUp, ImagePlus, Square } from "lucide-react"
import { CHAT_IMAGE_TYPES, CHAT_MAX_IMAGES, CHAT_MESSAGE_MAX_LENGTH, type ChatMode } from "@adt/types"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import { ChatImageThumbnails } from "./ChatImageThumbnails"
import { ChatModeSelect } from "./ChatModeSelect"
import { imageFiles, readChatImage } from "./chat-images"

interface ChatComposerProps {
  busy: boolean
  disabled: boolean
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  onSend: (text: string, images: string[]) => void
  onStop: () => void
}

export function ChatComposer({ busy, disabled, mode, onModeChange, onSend, onStop }: ChatComposerProps) {
  const { t } = useLingui()
  const [text, setText] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const canSend = !busy && !disabled && (text.trim() !== "" || images.length > 0)
  const full = images.length >= CHAT_MAX_IMAGES

  const attach = async (files: File[]) => {
    const accepted = imageFiles(files).slice(0, CHAT_MAX_IMAGES - images.length)
    if (accepted.length === 0) return
    setAttachError(null)
    try {
      const read = await Promise.all(accepted.map(readChatImage))
      setImages((current) => [...current, ...read].slice(0, CHAT_MAX_IMAGES))
    } catch {
      setAttachError(t`This image could not be read.`)
    }
  }

  const submit = () => {
    if (!canSend) return
    onSend(text.trim(), images)
    setText("")
    setImages([])
  }

  return (
    <form
      className="shrink-0 border-t border-border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(false)
        void attach(Array.from(event.dataTransfer.files))
      }}
    >
      <InputGroup className={cn("rounded-xl bg-background shadow-xs", dragging && "border-primary ring-3 ring-primary/20")}>
        {images.length > 0 && (
          <InputGroupAddon align="block-start" className="pt-3">
            <ChatImageThumbnails images={images} onRemove={(index) => setImages((current) => current.filter((_, i) => i !== index))} />
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          value={text}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          disabled={disabled}
          rows={2}
          aria-label={t`Message`}
          placeholder={disabled ? t`Approve or decline the change first` : t`Ask about this book…`}
          className="max-h-40 min-h-[52px] px-3 pt-3 text-sm"
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            const files = imageFiles(event.clipboardData.files)
            if (files.length === 0) return
            event.preventDefault()
            void attach(files)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <div className="flex items-center gap-0.5">
            <InputGroupButton
              size="icon-sm"
              className="size-7 text-muted-foreground"
              disabled={disabled || full}
              aria-label={t`Attach images`}
              title={full ? t`You can attach up to ${CHAT_MAX_IMAGES} images` : t`Attach images`}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus className="size-4" />
            </InputGroupButton>
            <ChatModeSelect value={mode} onChange={onModeChange} />
          </div>
          {busy ? (
            <InputGroupButton size="icon-sm" variant="outline" className="rounded-full" onClick={onStop} aria-label={t`Stop`}>
              <Square className="size-3.5 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton type="submit" size="icon-sm" variant="default" className="rounded-full" disabled={!canSend} aria-label={t`Send`}>
              <ArrowUp className="size-4" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      <input
        ref={fileInput}
        type="file"
        accept={CHAT_IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => {
          void attach(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
      {attachError && <p role="alert" className="mt-1.5 text-xs text-red-700">{attachError}</p>}
    </form>
  )
}
