import { useState } from "preact/hooks";
import type { FieldDiff, FieldState } from "../../core/analyze";
import { isNoindex, parseRobotsDirectives } from "../../core/xrobots";
import type { OkReport } from "../metrics";

const LABELS: Record<FieldState, string> = {
  same: "Same",
  changed: "Changed by JavaScript",
  "added-by-js": "Added by JavaScript",
  "removed-by-js": "Removed by JavaScript",
  absent: "Absent",
};

// Quoted verbatim from the page below (checked 2026-10-01).
const GOOGLE_URL = "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics";
const GOOGLE_QUOTE =
  "When Google encounters the noindex tag, it may skip rendering and JavaScript execution, which means using JavaScript to change or remove the robots meta tag from noindex may not work as expected. If you do want the page indexed, don't use a noindex tag in the original page code.";

const LINK_LIMIT = 200;

const hasNoindex = (values: readonly string[]) => isNoindex(parseRobotsDirectives(values), "*");

function removedNoindex(fields: readonly FieldDiff[]): FieldDiff | undefined {
  return fields.find((f) => f.field.startsWith("meta ") && hasNoindex(f.server) && !hasNoindex(f.rendered));
}

function Values({ values }: { values: string[] }) {
  if (values.length === 0) return <span class="muted">none</span>;
  return (
    <ul class="values">
      {values.map((v, i) => (
        <li key={i}>{v}</li>
      ))}
    </ul>
  );
}

function FieldRow({ diff }: { diff: FieldDiff }) {
  return (
    <tr data-field={diff.field} data-field-state={diff.state}>
      <th scope="row">{diff.field}</th>
      <td>
        <span class="pill" data-pill={diff.state}>
          {LABELS[diff.state]}
        </span>
      </td>
      <td>
        <Values values={diff.server} />
      </td>
      <td>
        <Values values={diff.rendered} />
      </td>
    </tr>
  );
}

export function FieldsView({ report }: { report: OkReport }) {
  const [showAbsent, setShowAbsent] = useState(false);
  const rows = report.fields.filter((f) => showAbsent || f.state !== "absent");
  const noindex = removedNoindex(report.fields);
  return (
    <>
      {noindex && (
        <section class="callout" role="note">
          <p>
            <strong>{noindex.field}</strong> has noindex in the server HTML, and the rendered page no longer has it.
          </p>
          <blockquote>“{GOOGLE_QUOTE}”</blockquote>
          <p class="muted">
            Google Search Central:{" "}
            <a href={GOOGLE_URL} target="_blank" rel="noreferrer">
              Understand the JavaScript SEO basics
            </a>
          </p>
        </section>
      )}
      <section>
        <div class="toolbar">
          <h2>Head fields and structured data</h2>
          <label class="toggle">
            <input
              type="checkbox"
              checked={showAbsent}
              onChange={(e) => {
                setShowAbsent(e.currentTarget.checked);
              }}
            />
            Show absent
          </label>
        </div>
        <table class="fields">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">State</th>
              <th scope="col">Server HTML</th>
              <th scope="col">Rendered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <FieldRow key={i} diff={d} />
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Links only in the rendered page ({report.jsOnlyLinks.length})</h2>
        <p class="muted">These links are not in the server HTML, so they are not found without running JavaScript.</p>
        <ul class="links">
          {report.jsOnlyLinks.slice(0, LINK_LIMIT).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {report.jsOnlyLinks.length > LINK_LIMIT && <p class="muted">and {report.jsOnlyLinks.length - LINK_LIMIT} more</p>}
      </section>
      <section>
        <h2>Server response headers</h2>
        <table class="fields">
          <tbody>
            {Object.entries(report.serverHeaders).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
