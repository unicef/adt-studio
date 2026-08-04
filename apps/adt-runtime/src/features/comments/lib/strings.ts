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
  "comments-identity-intro": "Tell reviewers who you are",
  "comments-name-required-label": "Enter a name to comment.",
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
  "comments-actions-label": "Comment actions",
  "comments-edit-label": "Edit",
  "comments-edit-body-label": "Edit your comment",
  "comments-save-label": "Save",
  "comments-delete-label": "Delete",
  "comments-delete-confirm-label": "Delete this comment?",
  "comments-delete-thread-confirm-label": "Delete this comment and its replies?",
  "comments-updated-label": "Comment updated",
  "comments-deleted-label": "Comment deleted",
  "comments-posted-label": "Comment posted",
  "comments-reply-posted-label": "Reply posted",
  "comments-update-failed-label": "Your change could not be saved. Try again.",
  "comments-delete-failed-label": "The comment could not be deleted. Try again.",
  "comments-move-label": "Move pin",
  "comments-move-instructions-label":
    "Pick a new place with the arrow keys, then press Enter. Esc cancels.",
  "comments-moved-label": "Pin moved",
  "comments-move-failed-label": "The pin could not be moved, so it stayed where it was.",
  "comments-move-cancelled-label": "Move cancelled",
  "comments-drag-hint-label": "Drag to move it. Esc cancels.",
  "comments-replies-label": "${count} replies",
  "comments-one-reply-label": "1 reply",
  "comments-show-resolved-label": "Show resolved",
  "comments-resolved-label": "Resolved",
  "comments-resolved-hint-label":
    "The author closed this thread. A reply still reaches them and stays with the resolved thread.",
  "comments-resolved-pin-aria-label": "Resolved comment ${number} by ${name}",
  "comments-resolved-hidden-label": "${count} resolved",
  "comments-one-resolved-label": "1 resolved",
  "comments-list-label": "Comments on this page",
  "comments-list-open-label": "Show the comments on this page",
  "comments-list-close-label": "Close the comment list",
  "comments-page-level-label": "Whole page",
  "comments-placement-instructions-label":
    "Move through the page with the arrow keys, then press Enter to comment there.",
  "comments-mode-keyboard-hint-label": "or tab into the page and press Enter",
} as const

export type CommentStringKey = keyof typeof COMMENT_STRINGS
