import type { BlockState } from "./core/align";

export interface StateMeta {
  label: string;
  /** Okabe-Ito palette, distinguishable with common colour-vision deficiencies. */
  color: string;
  /** Second cue besides colour, used by the page overlay and the panel legend. */
  border: "solid" | "dashed" | "dotted" | "double";
  description: string;
}

export const STATES: Record<BlockState, StateMeta> = {
  server: {
    label: "In server HTML",
    color: "#009E73",
    border: "solid",
    description: "The whole text is in the server HTML, in page order.",
  },
  partial: {
    label: "Partly in server HTML",
    color: "#E69F00",
    border: "dashed",
    description: "Only part of the text is in the server HTML; JavaScript changed or completed it.",
  },
  ambiguous: {
    label: "Repeated text",
    color: "#0072B2",
    border: "dotted",
    description: "The text is in the server HTML, but every copy there is already matched to another block.",
  },
  volatile: {
    label: "Changes per request",
    color: "#F0E442",
    border: "dashed",
    description: "Only the second server response had this text, so it varies between requests.",
  },
  "structured-data": {
    label: "Only in JSON-LD",
    color: "#56B4E9",
    border: "double",
    description: "The server HTML has this text only inside JSON-LD structured data, not as page text.",
  },
  "hydration-data": {
    label: "Only in hydration data",
    color: "#CC79A7",
    border: "double",
    description: "The server HTML has this text only inside framework hydration data, not as page text.",
  },
  "js-added": {
    label: "Added by JavaScript",
    color: "#D55E00",
    border: "solid",
    description: "The server HTML does not have this text; it appears only after JavaScript runs.",
  },
};
