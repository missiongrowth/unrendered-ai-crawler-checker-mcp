import type { ComponentChildren } from "preact";
import { IconAlertTriangle, IconChevronRight, IconExternalLink } from "../icons";

export function Disclosure({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <details class="disclosure">
      <summary class="hover-row">
        <IconChevronRight />
        <span>{title}</span>
      </summary>
      <div class="disclosure-body">{children}</div>
    </details>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a class="ext" href={href} target="_blank" rel="noreferrer">
      {children}
      <IconExternalLink />
    </a>
  );
}

export function Notice({ children }: { children: ComponentChildren }) {
  return (
    <p class="notice">
      <IconAlertTriangle />
      <span>{children}</span>
    </p>
  );
}

/** A small status label with a coloured dot; the text carries the meaning, the dot only adds to it. */
export function Badge({ tone, title, children, pill }: { tone: "ok" | "warn" | "bad" | "plain"; title?: string; children: ComponentChildren; pill?: string }) {
  return (
    <span class="badge" data-tone={tone} data-pill={pill} title={title}>
      {tone !== "plain" && <span class="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
