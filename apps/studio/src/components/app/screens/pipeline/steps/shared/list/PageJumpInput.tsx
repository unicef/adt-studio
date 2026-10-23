import { useEffect, useId, useState } from "react"
import { CornerDownLeft } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { findPageByNumber } from "./pageJump"

export function PageJumpInput<P extends { pageId: string; pageNumber: number }>({
  pages,
  onJump,
  className,
}: {
  pages: readonly P[]
  onJump: (page: P) => void
  className?: string
}) {
  const { t } = useLingui()
  const [value, setValue] = useState("")
  const [missing, setMissing] = useState<string | null>(null)
  const noteId = useId()

  useEffect(() => {
    if (!missing) return
    const timer = window.setTimeout(() => setMissing(null), 4000)
    return () => window.clearTimeout(timer)
  }, [missing])

  const jump = () => {
    if (!value.trim()) return
    const page = findPageByNumber(pages, value)
    if (!page) {
      setMissing(value.trim())
      return
    }
    setMissing(null)
    setValue("")
    onJump(page)
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            jump()
          }
        }}
        placeholder={t`Go to page`}
        aria-label={t`Go to page number`}
        aria-describedby={missing ? noteId : undefined}
        aria-invalid={missing ? true : undefined}
        className="h-8 w-[112px] rounded-lg border bg-background pl-2.5 pr-7 text-[12px] text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      <CornerDownLeft aria-hidden className="pointer-events-none absolute right-2 size-3 text-muted-foreground" />
      {missing && (
        <p
          id={noteId}
          role="status"
          className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11.5px] text-foreground shadow-sm animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
        >
          {t`Page ${missing} has no images here.`}
        </p>
      )}
    </div>
  )
}
