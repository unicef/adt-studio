import { useState, type KeyboardEvent, type RefObject } from "react"
import { Search } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Kbd } from "../../../ui/Kbd"

interface SettingsSearchBarProps {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  onFocusChange?: (focused: boolean) => void
  placeholder?: string
  size?: "sm" | "lg"
  className?: string
  inputClassName?: string
}

export function SettingsSearchBar({
  inputRef,
  value,
  onChange,
  onKeyDown,
  onFocusChange,
  placeholder,
  size = "sm",
  className,
  inputClassName,
}: SettingsSearchBarProps) {
  const { t } = useLingui()
  const [focused, setFocused] = useState(false)
  const showBadge = !focused && value.length === 0

  return (
    <div className={cn("relative", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "lg" ? "size-[18px]" : "size-[15px]",
        )}
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true)
          onFocusChange?.(true)
        }}
        onBlur={() => {
          setFocused(false)
          onFocusChange?.(false)
        }}
        placeholder={placeholder ?? t`Search settings…`}
        aria-label={t`Search settings`}
        className={cn(
          "w-full rounded-[10px] border bg-card pl-9 pr-9 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-brand-300 focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--brand-50)] [&::-webkit-search-cancel-button]:hidden",
          size === "lg" ? "h-11 text-sm" : "h-9 text-[13px]",
          inputClassName,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-150",
          showBadge ? "opacity-100" : "opacity-0",
        )}
      >
        <Kbd keys={["/"]} />
      </span>
    </div>
  )
}
