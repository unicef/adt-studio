import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

/**
 * Demo videos for the "See it in action" scene. Files live in
 * `public/demos/` (each a "BEFORE · PDF → AFTER · Accessible Web" screen
 * capture); prefix with `import.meta.env.BASE_URL` when rendering.
 */
export type Demo = {
  key: string;
  /** Filename under public/demos/, without extension. */
  file: string;
  seconds: number;
  title: MessageDescriptor;
  blurb: MessageDescriptor;
};

export const DEMOS: Demo[] = [
  {
    key: "showcase",
    file: "showcase-reel",
    seconds: 47,
    title: msg`Real books, before & after`,
    blurb: msg`Three real textbooks (Cuaderno 5, Momo and Katko) turned from flat PDFs into accessible interactive books.`,
  },
  {
    key: "assistant",
    file: "assistant-panel",
    seconds: 16,
    title: msg`Every accommodation, one panel`,
    blurb: msg`Easy-read, text-to-voice, sign language and glossary: readers toggle what they need, per book.`,
  },
  {
    key: "read-aloud",
    file: "read-aloud-highlight",
    seconds: 23,
    title: msg`Read-aloud with word highlighting`,
    blurb: msg`Narration follows the text word by word, with playback speed and voice controls.`,
  },
  {
    key: "math",
    file: "math-screen-reader",
    seconds: 15,
    title: msg`Math that reads aloud`,
    blurb: msg`Equations become real MathML that screen readers pronounce correctly, heard here through NVDA.`,
  },
  {
    key: "activities",
    file: "interactive-activities",
    seconds: 22,
    title: msg`Interactive activities`,
    blurb: msg`Drag-and-drop exercises generated from the book's own content, fully keyboard-accessible.`,
  },
  {
    key: "responsive",
    file: "responsive-any-device",
    seconds: 15,
    title: msg`Any device, any size`,
    blurb: msg`The same book reflows from desktop to phone without losing audio, structure or activities.`,
  },
];
