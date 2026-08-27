import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Button, type ButtonProps } from "@/components/ui/button"

interface PublishingSettingsLinkProps {
  children: ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  className?: string
}

/** Routes to Settings → Publishing, where the Cloudflare connect wizard lives. */
export function PublishingSettingsLink({
  children,
  variant = "default",
  size = "default",
  className,
}: PublishingSettingsLinkProps) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link to="/settings" search={{ section: "publishing" }}>
        {children}
      </Link>
    </Button>
  )
}
