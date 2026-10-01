import type { BlockState } from "../core/align";
import { STATES } from "../states";

const PULSE_MS = 1200;
const Z_MAX = "2147483647";

interface Layer {
  host: HTMLElement;
  root: ShadowRoot;
}

let layer: Layer | null = null;
let states: Record<number, BlockState> | null = null;
let lookup: ReadonlyMap<number, Element> = new Map();
let pulse: { el: Element; timer: ReturnType<typeof setTimeout> } | null = null;
let frame = 0;

function ensureLayer(): Layer {
  if (layer) return layer;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Z_MAX};margin:0;padding:0;border:0;`;
  const root = host.attachShadow({ mode: "closed" });
  document.documentElement.append(host);
  layer = { host, root };
  return layer;
}

function box(rect: DOMRect, css: string): HTMLElement {
  const div = document.createElement("div");
  div.style.cssText = `position:absolute;box-sizing:border-box;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;${css}`;
  return div;
}

function intersectsViewport(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}

function stateBoxes(): HTMLElement[] {
  const boxes: HTMLElement[] = [];
  for (const [key, state] of Object.entries(states ?? {})) {
    const el = lookup.get(Number(key));
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (!intersectsViewport(rect)) continue;
    const { color, border } = STATES[state];
    boxes.push(box(rect, `border:2px ${border} ${color};background:${color}26;`));
  }
  return boxes;
}

function pulseBox(): HTMLElement[] {
  if (!pulse) return [];
  const rect = pulse.el.getBoundingClientRect();
  if (!intersectsViewport(rect)) return [];
  const el = box(rect, "border:3px solid #D55E00;background:#D55E0033;outline:2px solid #fff;");
  el.animate([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], { duration: PULSE_MS / 2, iterations: 2 });
  return [el];
}

function draw(): void {
  frame = 0;
  if (!layer) return;
  layer.root.replaceChildren(...stateBoxes(), ...pulseBox());
}

function schedule(): void {
  if (frame || !layer) return;
  frame = requestAnimationFrame(draw);
}

const listenerOptions = { capture: true, passive: true } as const;

function release(): void {
  if (!layer) return;
  cancelAnimationFrame(frame);
  frame = 0;
  removeEventListener("scroll", schedule, listenerOptions);
  removeEventListener("resize", schedule);
  layer.host.remove();
  layer = null;
}

function releaseIfIdle(): void {
  if (!states && !pulse) release();
}

function attach(): void {
  const first = !layer;
  ensureLayer();
  if (first) {
    addEventListener("scroll", schedule, listenerOptions);
    addEventListener("resize", schedule);
  }
  schedule();
}

/** Draws a box per state for the given blocks, or removes everything drawn for `null`. */
export function setOverlay(next: Record<number, BlockState> | null, elements: ReadonlyMap<number, Element>): void {
  states = next;
  lookup = elements;
  if (next) attach();
  else {
    schedule();
    releaseIfIdle();
  }
}

/** Scrolls the element to the middle of the viewport and pulses a box on it, with or without the overlay. */
export function reveal(el: Element): void {
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  if (pulse) clearTimeout(pulse.timer);
  pulse = {
    el,
    timer: setTimeout(() => {
      pulse = null;
      schedule();
      releaseIfIdle();
    }, PULSE_MS),
  };
  attach();
}

/** Removes the host, the listeners and any running pulse. */
export function clearOverlay(): void {
  if (pulse) clearTimeout(pulse.timer);
  pulse = null;
  states = null;
  lookup = new Map();
  release();
}
