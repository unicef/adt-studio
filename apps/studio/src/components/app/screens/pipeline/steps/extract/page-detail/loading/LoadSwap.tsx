import { useEffect, useState, type ReactNode } from "react"

const FADE_MS = 220

export function LoadSwap({
  loading,
  placeholder,
  children,
}: {
  loading: boolean
  placeholder: ReactNode
  children: ReactNode
}) {
  const [wasLoading, setWasLoading] = useState(loading)
  const [fading, setFading] = useState(false)
  if (wasLoading !== loading) {
    setWasLoading(loading)
    if (!loading) setFading(true)
  }

  useEffect(() => {
    if (!fading) return
    const timer = setTimeout(() => setFading(false), FADE_MS)
    return () => clearTimeout(timer)
  }, [fading])

  if (loading)
    return (
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">{placeholder}</div>
    )
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4">
      {children}
      {fading && (
        <div
          aria-hidden
          inert
          className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-4 animate-out fade-out fill-mode-forwards duration-[220ms] ease-out motion-reduce:hidden"
        >
          {placeholder}
        </div>
      )}
    </div>
  )
}
