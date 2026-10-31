"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

function subscribeToDocumentTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

/** Follows the painted `dark` class rather than the stored preference, so a screen that forces
 *  light (the pipeline) keeps light toasts on top of it. */
function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeToDocumentTheme,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme()
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast group",
          actionButton:
            "h-8 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-data-[type=success]:!border-emerald-200 group-data-[type=success]:!bg-emerald-50 group-data-[type=success]:!text-emerald-700 group-data-[type=success]:hover:!bg-emerald-100",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
