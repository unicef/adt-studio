/**
 * Every reviewer-facing string in the comments feature, keyed the way the rest
 * of the runtime keys its chrome: flat kebab-case ids resolved out of
 * `assets/interface_translations/<lang>/interface_translations.json`.
 *
 * The runtime's own `t()` returns the *key* when a catalog is missing it, and
 * the shipped catalogs are demonstrably not key-complete (most locales trail
 * `en` by dozens of keys), so this table carries the English source text and
 * `useCommentsText()` falls back to it. A locale that has not been translated
 * yet reads English instead of leaking `comments-post-label` onto the page.
 */
export const COMMENT_STRINGS = {
  "comments-label": "Comments",
  "comments-mode-label": "Comment",
  "comments-mode-hint": "Click anywhere on the page to leave a comment",
  "comments-mode-exit-label": "Done commenting",
  "comments-closed-label": "Commenting is closed for this link",
  "comments-count-label": "${count} comments on this page",
  "comments-empty-label": "No comments on this page yet",
  "comments-body-placeholder": "Write a comment",
  "comments-reply-placeholder": "Reply",
  "comments-post-label": "Post",
  "comments-cancel-label": "Cancel",
  "comments-sending-label": "Sending…",
  "comments-name-label": "Your name",
  "comments-name-placeholder": "e.g. Maria",
  "comments-pin-label": "Choose a PIN",
  "comments-pin-hint": "Your PIN lets you edit your comments from any device.",
  "comments-pin-placeholder": "4–6 digits",
  "comments-identity-intro": "Tell reviewers who you are",
  "comments-name-taken-title": "Someone is already commenting as ${name}",
  "comments-name-taken-hint": "Enter the PIN for ${name} to continue as them.",
  "comments-claim-pin-label": "PIN for ${name}",
  "comments-claim-continue-label": "Continue",
  "comments-claim-failed-label": "That name and PIN do not match. Try again or use another name.",
  "comments-other-name-label": "Use another name",
  "comments-name-required-label": "Enter a name to comment.",
  "comments-pin-required-label": "Choose a PIN of 4 to 6 digits.",
  "comments-body-required-label": "Write something first.",
  "comments-body-too-long-label": "Comments are limited to ${max} characters.",
  "comments-failed-label": "Your comment could not be sent. Try again.",
  "comments-gone-label": "This link is no longer accepting comments.",
  "comments-thread-label": "Comment thread",
  "comments-you-label": "you",
  "comments-unanchored-label": "On this page",
  "comments-pin-aria-label": "Comment ${number} by ${name}",
  "comments-just-now-label": "just now",
  "comments-minutes-ago-label": "${count} min ago",
  "comments-hours-ago-label": "${count} h ago",
  "comments-days-ago-label": "${count} d ago",
  "comments-edited-label": "edited",
} as const

export type CommentStringKey = keyof typeof COMMENT_STRINGS
