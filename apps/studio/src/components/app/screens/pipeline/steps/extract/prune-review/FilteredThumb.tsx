import { useState } from "react"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { extractedImageUrl } from "../useExtractImages"

export function FilteredThumb({ label, imageId, alt, muted = false, className, fit = "contain", paper = false }: { label: string; imageId: string; alt: string; muted?: boolean; className?: string; fit?: "contain" | "cover"; paper?: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-md border", paper ? "bg-zinc-50 dark:bg-zinc-200" : "bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]", className)}>
      {failed ? (
        <ImageOff className="size-4 text-muted-foreground/50" aria-hidden />
      ) : (
        <img
          src={extractedImageUrl(label, imageId)}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            "max-h-full max-w-full transition-[filter,opacity] duration-300 motion-reduce:transition-none",
            fit === "cover" ? "size-full object-cover" : "object-contain",
            muted && "opacity-70 grayscale",
          )}
        />
      )}
    </span>
  )
}
