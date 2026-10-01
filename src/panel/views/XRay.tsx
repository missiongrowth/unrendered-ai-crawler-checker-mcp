import { useEffect, useMemo, useState } from "preact/hooks";
import type { BlockState } from "../../core/align";
import type { ClassifiedBlock, GateFailure } from "../../core/analyze";
import type { Snapshot } from "../../messages";
import { STATES } from "../../states";
import { flags, mainBasisText, percentText, STATE_ORDER, stateCounts, wordsOnlyAfterJs, type OkReport } from "../metrics";
import { postContent } from "../session";
import { Basis } from "./Basis";

export function gateText(g: GateFailure): string {
  switch (g.kind) {
    case "fetch-failed":
      return `The server HTML could not be fetched${g.detail === "" ? "." : `: ${g.detail}`}`;
    case "http-status":
      return `The server answered a request without cookies with HTTP ${g.status}, so there is no page HTML to compare.`;
    case "challenge":
      return `${g.challenge.vendor} answered with a challenge page (${g.challenge.header}: ${g.challenge.value}, HTTP ${g.status}), which is not the page's content.`;
    case "different-url":
      return `The request without cookies ended at a different URL (${g.finalUrl}), so it is not the same page.`;
  }
}

export function Gate({ failure }: { failure: GateFailure }) {
  return (
    <section class="gate" data-gate={failure.kind} role="alert">
      <h2>No comparison possible</h2>
      <p>{gateText(failure)}</p>
      <p class="muted">No percentage is shown because the server HTML is not the page's own content.</p>
    </section>
  );
}

function Swatch({ state }: { state: BlockState }) {
  return <span class="swatch" data-border={STATES[state].border} style={{ "--c": STATES[state].color }} aria-hidden="true" />;
}

function Metric({ name, metric, coverage, formula }: { name: string; metric: string; coverage: OkReport["main"]; formula: string }) {
  return (
    <tr title={formula}>
      <th scope="row">{name}</th>
      <td class="num">
        <strong data-metric={metric}>{percentText(coverage)}</strong>
      </td>
      <td class="num">
        {coverage.credited} / {coverage.total} words
      </td>
    </tr>
  );
}

function Metrics({ report }: { report: OkReport }) {
  const credited = "Words credited as present in the server HTML ÷ words of rendered text in scope.";
  return (
    <>
      <table class="metrics">
        <caption class="sr-only">Server HTML coverage</caption>
        <thead>
          <tr>
            <th scope="col">Scope</th>
            <th scope="col">In server HTML</th>
            <th scope="col">Words</th>
          </tr>
        </thead>
        <tbody>
          <Metric name="Main content" metric="main" coverage={report.main} formula={`${credited} Scope: ${mainBasisText(report)}.`} />
          <Metric name="All visible text" metric="all" coverage={report.all} formula={`${credited} Scope: all visible rendered text outside dialogs.`} />
          <Metric name="Hidden text" metric="hidden" coverage={report.hidden} formula={`${credited} Scope: rendered text the browser does not display.`} />
        </tbody>
      </table>
      <details>
        <summary>How these numbers are calculated</summary>
        <p>{credited} The scope of “main content” on this page is {mainBasisText(report)}.</p>
        <p>
          Hidden text is counted separately and never dropped. “Words only after JavaScript” adds the words of blocks added by JavaScript and the words of partly matched blocks that the server HTML does not have, in visible text outside dialogs.
        </p>
      </details>
    </>
  );
}

function Legend({ counts, filter, onFilter }: { counts: Record<BlockState, number>; filter: BlockState | null; onFilter: (s: BlockState | null) => void }) {
  return (
    <div class="legend" role="group" aria-label="Filter blocks by state">
      {STATE_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          class="chip"
          aria-pressed={filter === s}
          disabled={counts[s] === 0}
          title={STATES[s].description}
          onClick={() => {
            onFilter(filter === s ? null : s);
          }}
        >
          <Swatch state={s} />
          {STATES[s].label} <span class="count">{counts[s]}</span>
        </button>
      ))}
    </div>
  );
}

function BlockRow({ block }: { block: ClassifiedBlock }) {
  const share = block.state === "partial" && block.tokens > 0 ? ` · ${Math.floor((block.credited / block.tokens) * 100)}% in server HTML` : "";
  return (
    <li>
      <button
        type="button"
        class="block"
        data-state={block.state}
        data-block-id={block.id}
        data-hidden={block.hidden}
        style={{ "--c": STATES[block.state].color }}
        title={STATES[block.state].description}
        onClick={() => {
          postContent({ type: "reveal", id: block.id });
        }}
      >
        <Swatch state={block.state} />
        <span class="block-body">
          <span class="block-meta">
            {STATES[block.state].label} · {block.tag} · {block.region}
            {block.hidden ? " · hidden" : ""}
            {share}
          </span>
          <span class="block-text">{block.text}</span>
        </span>
      </button>
    </li>
  );
}

export function XRayView({ report, snapshot }: { report: OkReport; snapshot: Snapshot }) {
  const [filter, setFilter] = useState<BlockState | null>(null);
  const [overlay, setOverlay] = useState(false);
  const counts = useMemo(() => stateCounts(report.blocks), [report]);
  const shown = useMemo(() => (filter === null ? report.blocks : report.blocks.filter((b) => b.state === filter)), [report, filter]);

  useEffect(() => {
    if (!overlay) {
      postContent({ type: "overlay", states: null });
      return;
    }
    const states: Record<number, BlockState> = {};
    for (const b of shown) if (!b.hidden) states[b.id] = b.state;
    postContent({ type: "overlay", states });
  }, [overlay, shown]);

  const words = wordsOnlyAfterJs(report);
  return (
    <>
      <section class="hero">
        <p class="hero-line">
          <strong>{percentText(report.main)}</strong> of the main content is in the server HTML · <strong>{words}</strong> {words === 1 ? "word only appears" : "words only appear"} after JavaScript
        </p>
        <p class="muted">
          {snapshot.settled ? `Page settled after ${(snapshot.settleMs / 1000).toFixed(1)} s. ` : ""}Server response: HTTP {report.status}, request without cookies.
        </p>
        <Metrics report={report} />
        <Basis />
        <ul class="flags">
          {flags(report, snapshot).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>
      <section>
        <div class="toolbar">
          <h2>Blocks</h2>
          <label class="toggle">
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => {
                setOverlay(e.currentTarget.checked);
              }}
            />
            Overlay on page
          </label>
        </div>
        <Legend counts={counts} filter={filter} onFilter={setFilter} />
        <ul class="blocks">
          {shown.map((b) => (
            <BlockRow key={b.id} block={b} />
          ))}
        </ul>
        {shown.length === 0 && <p class="muted">No blocks in this state.</p>}
      </section>
      <section>
        <h2>Removed by JavaScript ({report.removed.length})</h2>
        <p class="muted">Text that is in the server HTML but not in the rendered page. It cannot be marked on the page.</p>
        <ul class="removed">
          {report.removed.map((t, i) => (
            <li key={i} data-removed>
              {t}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
