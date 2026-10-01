import { CONFIG } from "../config";
import { readFields } from "../core/fields";
import { segment } from "../core/segment";
import { fetchRaw } from "../fetch-raw";
import type { RenderedBlock, Snapshot } from "../messages";

export interface BlockIndex {
  all: Map<number, Element>;
  /** Blocks that have a box on screen; the overlay draws only these. */
  visible: Map<number, Element>;
}

export interface SnapshotResult {
  snapshot: Snapshot;
  index: BlockIndex;
}

interface Settled {
  settled: boolean;
  settleMs: number;
}

/** readyState "complete", then no DOM mutation for `settleQuietMs`, all bounded by `settleMaxMs` from `start`. */
function settle(start: number): Promise<Settled> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      if (document.readyState === "complete") arm();
    });
    const finish = (settled: boolean): void => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      window.removeEventListener("load", arm);
      resolve({ settled, settleMs: Math.round(performance.now() - start) });
    };
    function arm(): void {
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        finish(true);
      }, CONFIG.settleQuietMs);
    }
    const cap = setTimeout(
      () => {
        finish(false);
      },
      Math.max(0, CONFIG.settleMaxMs - (performance.now() - start)),
    );
    observer.observe(document, { childList: true, characterData: true, subtree: true });
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm);
  });
}

export type ShadowRootOf = (el: Element) => ShadowRoot | null;

const openOrClosedShadowRoot: ShadowRootOf = (el) => (el instanceof HTMLElement ? (chrome.dom.openOrClosedShadowRoot(el) ?? null) : null);

/** Parent in the composed tree: slot, then shadow host, then light parent. */
function composedParent(el: Element): Element | null {
  if (el.assignedSlot) return el.assignedSlot;
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** `display: contents` has no box of its own, so visibility is judged on the nearest ancestor that has one. */
function boxElement(el: Element): Element {
  let cur = el;
  while (getComputedStyle(cur).display === "contents") {
    const parent = composedParent(cur);
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

function isHidden(el: Element): boolean {
  const box = boxElement(el);
  const visible = box.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  if (!visible) return true;
  const rect = box.getBoundingClientRect();
  return rect.width === 0 || rect.height === 0;
}

function collectBlocks(shadowRootOf: ShadowRootOf): { blocks: RenderedBlock[]; index: BlockIndex } {
  const index: BlockIndex = { all: new Map(), visible: new Map() };
  const blocks = segment(document.body, { shadowRootOf, includeNoscript: false }).map((seg, id): RenderedBlock => {
    const hidden = isHidden(seg.el);
    index.all.set(id, seg.el);
    if (!hidden) index.visible.set(id, seg.el);
    return { id, tag: seg.tag, text: seg.text, region: seg.region, hidden };
  });
  return { blocks, index };
}

/**
 * Rendered snapshot of this document plus the three raw fetches, started together with the settle wait.
 * `shadowRootOf` defaults to the extension API, which also reaches closed shadow roots; a runner without extension APIs passes its own.
 */
export async function takeSnapshot(crawlerTokens: readonly string[], shadowRootOf: ShadowRootOf = openOrClosedShadowRoot): Promise<SnapshotResult> {
  const start = performance.now();
  const url = location.href;
  const characterSet = document.characterSet;
  const rawFetches = Promise.all([
    fetchRaw(url, "omit", characterSet),
    fetchRaw(url, "omit", characterSet),
    fetchRaw(url, "include", characterSet),
  ]);
  const [{ settled, settleMs }, [first, second, withCookies]] = await Promise.all([settle(start), rawFetches]);
  const { blocks, index } = collectBlocks(shadowRootOf);
  const html = document.documentElement;
  const snapshot: Snapshot = {
    url,
    characterSet,
    viewportWidth: innerWidth,
    settled,
    settleMs,
    translated: html.classList.contains("translated-ltr") || html.classList.contains("translated-rtl"),
    iframes: document.querySelectorAll("iframe, frame").length,
    blocks,
    fields: readFields(document, url, crawlerTokens),
    raw: { first, second, withCookies },
  };
  return { snapshot, index };
}
