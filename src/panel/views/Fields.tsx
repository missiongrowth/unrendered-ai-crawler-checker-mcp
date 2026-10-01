import { useState } from "preact/hooks";
import type { FieldDiff } from "../../core/analyze";
import { isNoindex, parseRobotsDirectives } from "../../core/xrobots";
import { FIELD_LABEL } from "../copy";
import { IconAlertTriangle, IconChevronRight } from "../icons";
import { differs, type OkReport } from "../metrics";
import { Badge, Disclosure, ExternalLink } from "./ui";

// Quoted verbatim from the page below (checked 2026-10-01).
const GOOGLE_URL = "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics";
const GOOGLE_QUOTE =
  "When Google encounters the noindex tag, it may skip rendering and JavaScript execution, which means using JavaScript to change or remove the robots meta tag from noindex may not work as expected. If you do want the page indexed, don't use a noindex tag in the original page code.";

const LINK_LIMIT = 200;

const hasNoindex = (values: readonly string[]) => isNoindex(parseRobotsDirectives(values), "*");

function removedNoindex(fields: readonly FieldDiff[]): FieldDiff | undefined {
  return fields.find((f) => f.field.startsWith("meta ") && hasNoindex(f.server) && !hasNoindex(f.rendered));
}

function Values({ label, values }: { label: string; values: string[] }) {
  return (
    <div class="values">
      <span class="values-label">{label}</span>
      {values.length === 0 ? (
        <span class="muted">Not set</span>
      ) : (
        <ul>
          {values.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldRow({ diff }: { diff: FieldDiff }) {
  return (
    <details class="field-row" data-field={diff.field} data-field-state={diff.state}>
      <summary class="hover-row">
        <IconChevronRight />
        <span class="field-name">{diff.field}</span>
        <Badge tone="plain" pill={diff.state}>
          {FIELD_LABEL[diff.state]}
        </Badge>
      </summary>
      <div class="field-values">
        <Values label="Raw HTML" values={diff.server} />
        <Values label="Rendered HTML" values={diff.rendered} />
      </div>
    </details>
  );
}

export function FieldsView({ report }: { report: OkReport }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const unchanged = report.fields.filter((f) => !differs(f));
  const rows = report.fields.filter((f) => showUnchanged || differs(f));
  const noindex = removedNoindex(report.fields);
  const links = report.jsOnlyLinks;
  return (
    <>
      {noindex && (
        <section class="callout" role="note">
          <p class="callout-title">
            <IconAlertTriangle />
            noindex is only in the raw HTML
          </p>
          <p>{noindex.field} says noindex in the raw HTML, and JavaScript removes it. Google says:</p>
          <blockquote>{GOOGLE_QUOTE}</blockquote>
          <ExternalLink href={GOOGLE_URL}>Google Search Central: JavaScript SEO basics</ExternalLink>
        </section>
      )}
      <section>
        <div class="section-head">
          <h2>Head and structured data</h2>
          {unchanged.length > 0 && (
            <button
              type="button"
              class="btn small"
              aria-pressed={showUnchanged}
              onClick={() => {
                setShowUnchanged(!showUnchanged);
              }}
            >
              Show unchanged ({unchanged.length})
            </button>
          )}
        </div>
        {report.fields.every((f) => !differs(f)) && <p class="muted">Every field is the same in the raw and rendered HTML.</p>}
        <div class="rows">
          {rows.map((d, i) => (
            <FieldRow key={i} diff={d} />
          ))}
        </div>
      </section>
      {links.length > 0 && (
        <Disclosure title={`Links only in rendered HTML (${String(links.length)})`}>
          <p class="muted">Crawlers that don't run JavaScript can't find these links.</p>
          <ul class="links">
            {links.slice(0, LINK_LIMIT).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {links.length > LINK_LIMIT && <p class="muted">and {links.length - LINK_LIMIT} more</p>}
        </Disclosure>
      )}
      <Disclosure title="Raw HTML response headers">
        <dl class="headers">
          {Object.entries(report.serverHeaders).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </>
  );
}
