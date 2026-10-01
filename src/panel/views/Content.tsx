import { useEffect, useMemo, useState } from "preact/hooks";
import type { BlockState } from "../../core/align";
import type { ClassifiedBlock, GateFailure } from "../../core/analyze";
import { RENDER_STUDY } from "../../data/bots";
import type { Snapshot } from "../../messages";
import { STATES } from "../../states";
import { GROUP_LABEL, HERO_SUB, MAIN_BASIS, NO_MAIN_TEXT, STAT_LABELS, wordsLine, wordsOf } from "../copy";
import { heroText, notices, percentText, renderGroups, STATE_ORDER, stateCounts, wordsOnlyAfterJs, type OkReport, type RenderGroup } from "../metrics";
import { postContent } from "../session";
import { Disclosure, ExternalLink, Notice } from "./ui";

export function gateText(g: GateFailure): string {
  switch (g.kind) {
    case "fetch-failed":
      return `The raw HTML could not be fetched${g.detail === "" ? "" : `: ${g.detail}`}. Reload the page and try again.`;
    case "http-status":
      return `The server answered HTTP ${String(g.status)} to a request without cookies, so there is no page to compare.`;
    case "challenge":
      return `${g.challenge.vendor} sent a challenge page (${g.challenge.header}: ${g.challenge.value}, HTTP ${String(g.status)}) instead of the page. Crawlers without a browser are likely to get it too.`;
    case "different-url":
      return `A request without cookies ended at a different URL: ${g.finalUrl}. Open that URL and analyse it there.`;
  }
}

export function Gate({ failure }: { failure: GateFailure }) {
  return (
    <section class="gate" data-gate={failure.kind} role="alert">
      <h2>No comparison for this page</h2>
      <p>{gateText(failure)}</p>
      <p class="muted">No percentage is shown, because the raw HTML is not this page.</p>
    </section>
  );
}

const STRIPED = new Set<RenderGroup["id"]>(["data"]);

function RenderBar({ groups }: { groups: RenderGroup[] }) {
  const [raw, data, rendered] = groups;
  const label = `Main content: ${String(raw?.percent)}% in raw HTML, ${String(data?.percent)}% only in data, ${String(rendered?.percent)}% only in rendered HTML`;
  return (
    <>
      <div class="render-bar" role="img" aria-label={label}>
        {groups.map((g) => (
          <span key={g.id} class="seg" data-striped={STRIPED.has(g.id)} style={{ "--c": STATES[g.state].color, flexGrow: g.words }} hidden={g.words === 0} />
        ))}
      </div>
      <ul class="bar-legend">
        {groups.map((g) => (
          <li key={g.id}>
            <span class="swatch" data-striped={STRIPED.has(g.id)} style={{ "--c": STATES[g.state].color }} aria-hidden="true" />
            {GROUP_LABEL[g.id]} <span class="num muted">{g.percent}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ name, metric, coverage }: { name: string; metric: string; coverage: OkReport["main"] }) {
  return (
    <div class="stat">
      <span class="stat-label">{name}</span>
      <strong class="num" data-metric={metric}>
        {percentText(coverage)}
      </strong>
      {coverage.total > 0 && <span class="stat-sub num">{wordsOf(coverage.credited, coverage.total)}</span>}
    </div>
  );
}

function Measured({ report, snapshot }: { report: OkReport; snapshot: Snapshot }) {
  return (
    <Disclosure title="How this is measured">
      <p>Each block of text on the rendered page is matched, in order, against a fresh copy of the raw HTML fetched by this tab without cookies.</p>
      <p>{MAIN_BASIS[report.mainBasis]}</p>
      <p>Hidden text (collapsed, display:none, invisible) is counted on its own and is not part of the percentages above.</p>
      <p>Measured at a page width of {snapshot.viewportWidth} px. The side panel narrows the page, which can change what is hidden.</p>
      <p>
        Why it matters: {RENDER_STUDY.publisher} measured AI crawler traffic and found that "none of the major AI crawlers currently render JavaScript" ({RENDER_STUDY.date}, third-party study).{" "}
        <ExternalLink href={RENDER_STUDY.url}>Read the study</ExternalLink>
      </p>
    </Disclosure>
  );
}

function Chips({ counts, filter, onFilter }: { counts: Record<BlockState, number>; filter: BlockState | null; onFilter: (s: BlockState | null) => void }) {
  return (
    <div class="chips" role="group" aria-label="Text blocks">
      {STATE_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          class="chip hover-row"
          aria-pressed={filter === s}
          disabled={counts[s] === 0}
          title={STATES[s].description}
          onClick={() => {
            onFilter(filter === s ? null : s);
          }}
        >
          <span class="swatch" style={{ "--c": STATES[s].color }} aria-hidden="true" />
          {STATES[s].label} <span class="num muted">{counts[s]}</span>
        </button>
      ))}
    </div>
  );
}

function BlockRow({ block }: { block: ClassifiedBlock }) {
  const share = block.state === "partial" && block.tokens > 0 ? ` · ${String(Math.floor((block.credited / block.tokens) * 100))}% in raw HTML` : "";
  return (
    <li>
      <button
        type="button"
        class="block hover-row"
        data-state={block.state}
        data-block-id={block.id}
        data-hidden={block.hidden}
        data-border={STATES[block.state].border}
        style={{ "--c": STATES[block.state].color }}
        title="Click to scroll to it on the page"
        onClick={() => {
          postContent({ type: "reveal", id: block.id });
        }}
      >
        <span class="block-text">{block.text}</span>
        <span class="block-meta">
          {block.tag}
          {block.region === "other" || block.region === block.tag ? "" : ` · in ${block.region}`}
          {block.hidden ? " · hidden" : ""}
          {share}
        </span>
      </button>
    </li>
  );
}

export function ContentView({ report, snapshot }: { report: OkReport; snapshot: Snapshot }) {
  const [filter, setFilter] = useState<BlockState | null>(null);
  const [overlay, setOverlay] = useState(false);
  const counts = useMemo(() => stateCounts(report.blocks), [report]);
  const groups = useMemo(() => renderGroups(report), [report]);
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

  const flagged = notices(report, snapshot);
  return (
    <>
      <section class="hero">
        <p class="hero-number num">{heroText(report.main)}</p>
        {report.main.total === 0 ? (
          <p class="hero-sub">{NO_MAIN_TEXT}</p>
        ) : (
          <>
            <p class="hero-sub">{HERO_SUB}</p>
            <RenderBar groups={groups} />
            <p class="hero-words">{wordsLine(wordsOnlyAfterJs(report))}</p>
          </>
        )}
      </section>
      <section class="stats">
        <Stat name={STAT_LABELS.main} metric="main" coverage={report.main} />
        <Stat name={STAT_LABELS.all} metric="all" coverage={report.all} />
        <Stat name={STAT_LABELS.hidden} metric="hidden" coverage={report.hidden} />
      </section>
      {flagged.length > 0 && (
        <section class="notices">
          {flagged.map((f) => (
            <Notice key={f}>{f}</Notice>
          ))}
        </section>
      )}
      <Measured report={report} snapshot={snapshot} />
      <section class="blocks-section">
        <div class="section-head">
          <h2>
            Text blocks <span class="num muted">{report.blocks.length}</span>
          </h2>
          <label class="switch">
            <input
              type="checkbox"
              role="switch"
              checked={overlay}
              onChange={(e) => {
                setOverlay(e.currentTarget.checked);
              }}
            />
            <span class="track" aria-hidden="true" />
            Show on page
          </label>
        </div>
        <Chips counts={counts} filter={filter} onFilter={setFilter} />
        <ul class="blocks">
          {shown.map((b) => (
            <BlockRow key={b.id} block={b} />
          ))}
        </ul>
        {shown.length === 0 && <p class="muted">No blocks in this group.</p>}
      </section>
      {report.removed.length > 0 && (
        <Disclosure title={`Only in raw HTML (${String(report.removed.length)})`}>
          <p class="muted">Text in the raw HTML that the rendered page no longer shows.</p>
          <ul class="removed">
            {report.removed.map((t, i) => (
              <li key={i} data-removed>
                {t}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </>
  );
}
