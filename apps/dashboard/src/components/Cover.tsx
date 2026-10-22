import { useState } from "react"

interface CoverProps {
  src: string
  name: string
  className?: string
}

const initials = (name: string) =>
  name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

export function Cover(props: CoverProps) {
  return <CoverImage key={props.src} {...props} />
}

function CoverImage({ src, name, className = "" }: CoverProps) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-ink/[0.06] shadow-[0_0_0_1px_var(--line)] ${className}`}>
      {state !== "missing" && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState("ready")}
          onError={() => setState("missing")}
          className={`absolute inset-0 size-full object-cover object-top transition-opacity duration-200 ${state === "ready" ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {state === "missing" && (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[10px] font-medium tracking-wide text-muted">
          {initials(name)}
        </span>
      )}
    </span>
  )
}
