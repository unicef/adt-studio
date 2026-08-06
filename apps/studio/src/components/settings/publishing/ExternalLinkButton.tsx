import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"

interface ExternalLinkButtonProps {
  href: string
  children: ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  className?: string
  /** For the screens that draw one of these per book: "Open" is a fine label next to a single
   *  publication and a useless one in a list of them, where the accessible name has to say which
   *  book it opens. */
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
