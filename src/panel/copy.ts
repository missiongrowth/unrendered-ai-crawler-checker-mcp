import type { FieldState } from "../core/analyze";
import type { BotClass } from "../data/bots";
import type { GroupId } from "./metrics";

/** Strings shared by several views and the Markdown report; see notes/COPY.md. */
export const FIELD_LABEL: Record<FieldState, string> = {
  same: "Same",
  changed: "Changed by JavaScript",
  "added-by-js": "Only in rendered HTML",
  "removed-by-js": "Only in raw HTML",
  absent: "Not set",
};

export const GROUP_LABEL: Record<GroupId, string> = {
  raw: "In raw HTML",
  data: "Only in data",
  rendered: "Only in rendered HTML",
};

export const CLASS_LABEL: Record<BotClass, string> = {
  training: "Training",
  search: "Search",
  "user-fetch": "User request",
  "control-token": "Usage control only",
};

export const STAT_LABELS = { main: "Main content", all: "All visible text", hidden: "Hidden text" } as const;

export const MAIN_BASIS = {
  "main-landmark": "Main content is the page's <main> element.",
  "outside-landmarks": "This page has no <main> element, so main content is all text outside the header, navigation, sidebars, footer and dialogs.",
} as const;

export const HERO_SUB = "of the main content is in the raw HTML";
export const NO_MAIN_TEXT = "The main content has no visible text, so there is nothing to compare.";

export const wordsLine = (n: number): string => (n === 0 ? "Every word of the main content is in the raw HTML" : n === 1 ? "1 word appears only in the rendered HTML" : `${String(n)} words appear only in the rendered HTML`);

export const wordsOf = (credited: number, total: number): string => `${String(credited)} of ${String(total)} words`;
