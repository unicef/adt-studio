import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"

interface ExternalLinkButtonProps {
  href: string
  children: ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  className?: string
  title?: string
  "aria-label"?: string
}

export function ExternalLinkButton({
  href,
  children,
  variant = "outline",
  size = "sm",
  className,
  title,
  "aria-label": ariaLabel,
}: ExternalLinkButtonProps) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title={title}
        aria-label={ariaLabel}
      >
        {children}
        <ExternalLink aria-hidden="true" />
      </a>
    </Button>
  )
}
