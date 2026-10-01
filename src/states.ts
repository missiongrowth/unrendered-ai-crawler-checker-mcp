import type { BlockState } from "./core/align";

export interface StateMeta {
  /** Short label for chips and legends. */
  label: string;
  /** Okabe-Ito palette, distinguishable with common colour-vision deficiencies. */
  color: string;
  /** Second cue besides colour, used by the page overlay and the panel legend. */
  border: "solid" | "dashed" | "dotted" | "double";
  description: string;
}

export const STATES: Record<BlockState, StateMeta> = {
  server: {
    label: "In raw HTML",
    color: "#009E73",
    border: "solid",
    description: "This text is in the raw HTML.",
  },
  partial: {
    label: "Partly",
    color: "#E69F00",
    border: "dashed",
    description: "Part of this text is in the raw HTML. JavaScript adds or changes the rest.",
  },
  ambiguous: {
    label: "Repeated or moved",
    color: "#0072B2",
    border: "dotted",
    description: "The same text is in the raw HTML, but not at this position. It is an extra copy or JavaScript moved it.",
  },
  volatile: {
    label: "Varies per request",
    color: "#F0E442",
    border: "dashed",
    description: "Only one of two raw HTML requests had this text. The server does not always send it.",
  },
  "structured-data": {
    label: "Only in JSON-LD",
    color: "#56B4E9",
    border: "double",
    description: "In the raw HTML this text exists only inside JSON-LD structured data, not as visible text.",
  },
  "hydration-data": {
    label: "Only in hydration data",
    color: "#CC79A7",
    border: "double",
    description: "In the raw HTML this text exists only inside framework data (such as Next.js __NEXT_DATA__ or the RSC payload), not as visible text.",
  },
  "js-added": {
    label: "Only in rendered HTML",
    color: "#D55E00",
    border: "solid",
    description: "This text is not in the raw HTML. It appears only after JavaScript runs.",
  },
};
