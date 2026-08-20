export interface ChromeToggleIconProps {
  /** Dims the chip to mirror the controls being hidden. */
  hidden?: boolean
  className?: string
}

/** The workspace itself: the canvas frame and the control chip at its top right
 *  — the one thing this button toggles. The dock collapses on its own. */
export function ChromeToggleIcon({ hidden, className }: ChromeToggleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="2.75" y="3.75" width="18.5" height="16.5" rx="2.75" strokeWidth="1.5" />
      <g strokeWidth="2.75" className="transition-opacity duration-200" opacity={hidden ? 0.3 : 1}>
        <path d="M13.5 7.75h4" />
      </g>
    </svg>
  )
}
