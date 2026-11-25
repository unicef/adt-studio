import { Component, type ErrorInfo, type ReactNode } from "react"
import { reportRuntimeError } from "@/features/reader-source/preview"

interface ChromeErrorBoundaryProps {
  children: ReactNode
}

export class ChromeErrorBoundary extends Component<ChromeErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("ADT reader interface failed", error)
    reportRuntimeError(error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
