import type { BotReport, BotRow, ProbeVerdict } from "../../core/botcheck";
import type { RobotsFetch, RobotsReason } from "../../core/robots";
import { BOTS_CHECKED, RENDER_STUDY, type Bot, type BotClass } from "../../data/bots";
import type { BotRun } from "../botrun";
import { Basis } from "./Basis";

const CLASS_LABEL: Record<BotClass, string> = {
  training: "Training",
  search: "Search",
  "user-fetch": "User fetch",
  "control-token": "robots.txt control token only",
};

const REASON: Record<RobotsReason, string> = {
  rules: "matched a rule",
  "no-matching-rule": "no rule matches this URL",
  "4xx-allow-all": "robots.txt answered 4xx, treated as allow all",
  "5xx-disallow-all": "robots.txt answered 5xx, treated as disallow all",
  "unreachable-disallow-all": "robots.txt was unreachable, treated as disallow all",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function verdictText(v: ProbeVerdict): string {
  switch (v.kind) {
    case "error":
      return `Error: ${v.detail}`;
    case "challenged":
      return `Challenged by ${v.challenge.vendor} (HTTP ${v.status})`;
    case "rate-limited":
      return "Rate-limited (HTTP 429)";
    case "blocked":
      return `Blocked (HTTP ${v.status})`;
    case "redirected-elsewhere":
      return `Redirected elsewhere: ${v.finalUrl}`;
    case "different":
      return `Different content from the control request (word overlap ${pct(v.similarity)})`;
    case "same":
      return `Same content as the control request (word overlap ${pct(v.similarity)})`;
  }
}

function renders(bot: Bot): string {
  if (bot.rendersJs === null) return "JavaScript: not measured";
  return bot.rendersJs ? "Runs JavaScript" : "Does not run JavaScript";
}

function BotLine({ row }: { row: BotRow }) {
  const { bot, robots, probe } = row;
  const verdict = probe?.verdict.kind ?? "not-probed";
  return (
    <tr data-bot={bot.token} data-verdict={verdict} data-robots={robots.allowed ? "allowed" : "disallowed"}>
      <th scope="row">
        <span class="bot-token">{bot.token}</span>
        <span class="muted">
          {bot.vendor} · {CLASS_LABEL[bot.class]}
        </span>
      </th>
      <td>
        <span class="pill" data-pill={robots.allowed ? "allowed" : "disallowed"}>
          {robots.allowed ? "Allowed" : "Disallowed"}
        </span>
        <span class="muted">
          {REASON[robots.reason]}
          {robots.specificGroup ? "; a group names this token" : ""}
        </span>
        {robots.line !== null && (
          <code class="line">
            line {robots.line}: {robots.lineText}
          </code>
        )}
      </td>
      <td>
        {probe === null ? (
          <span class="muted">Not probed{bot.userAgent === null ? ": the vendor publishes no user-agent string to send" : ""}</span>
        ) : (
          <>
            <span>{verdictText(probe.verdict)}</span>
            {probe.noindex && <span class="pill" data-pill="noindex">noindex in this response</span>}
          </>
        )}
      </td>
      <td>
        <span>{renders(bot)}</span>
        <details>
          <summary>Vendor documentation</summary>
          <p>
            <a href={bot.docUrl} target="_blank" rel="noreferrer">
              {bot.docUrl}
            </a>
          </p>
          {bot.robotsNote !== null && <blockquote>“{bot.robotsNote}”</blockquote>}
          {bot.userAgent !== null && <code class="line">{bot.userAgent}</code>}
        </details>
      </td>
    </tr>
  );
}

const robotsStatus = (r: RobotsFetch): string => ("error" in r ? `robots.txt could not be fetched: ${r.error}` : `robots.txt: HTTP ${r.status}`);

function Signals({ report }: { report: BotReport }) {
  if (report.contentSignals.length === 0 || "error" in report.robots) return null;
  const lines = report.robots.body.split(/\r\n|\r|\n/);
  return (
    <section>
      <h2>Content-Signal lines in robots.txt</h2>
      <ul class="signals">
        {report.contentSignals.map((s) => (
          <li key={s.line}>
            <code class="line">{lines[s.line - 1]?.trim() ?? s.value}</code>
            <span class="muted">line {s.line} · applies to {s.agents.length === 0 ? "no named group" : s.agents.join(", ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Results({ report }: { report: BotReport }) {
  return (
    <>
      <p class="muted">
        {robotsStatus(report.robots)} (RFC 9309 §2.3.1: 2xx is parsed, 4xx means allow all, 5xx or unreachable means disallow all;{" "}
        <a href="https://www.rfc-editor.org/rfc/rfc9309" target="_blank" rel="noreferrer">
          rfc-editor.org/rfc/rfc9309
        </a>
        ).{" "}
        {report.controlSimilarity === null
          ? "The two control requests did not both succeed, so “same” means identical word sets."
          : `The two control requests were ${pct(report.controlSimilarity)} alike; a bot response counts as the same when it is at least that close to a control.`}
      </p>
      <table class="bots">
        <thead>
          <tr>
            <th scope="col">Bot</th>
            <th scope="col">robots.txt for this URL</th>
            <th scope="col">A request with this user-agent from your IP got</th>
            <th scope="col">JavaScript</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <BotLine key={row.bot.token} row={row} />
          ))}
        </tbody>
      </table>
      <Signals report={report} />
    </>
  );
}

export function BotsView({ run, onRun }: { run: BotRun; onRun: () => void }) {
  return (
    <>
      <section class="callout" role="note">
        <p>
          These requests come from your IP address with a bot's published user-agent. They are not verified bots: WAFs verify bots by IP address, so a site can answer differently to the real bot.
        </p>
      </section>
      <section>
        <div class="toolbar">
          <button type="button" class="primary" disabled={run.status === "running"} onClick={onRun}>
            Run bot check
          </button>
          <span class="muted" role="status">
            {run.status === "running" ? "Checking robots.txt and fetching the page…" : ""}
          </span>
        </div>
        <p class="muted">The browser asks for access to this site first; the check fetches robots.txt and the page with each user-agent.</p>
        {run.status === "error" && (
          <p class="error" role="alert">
            {run.message}
          </p>
        )}
      </section>
      {run.status === "done" && <Results report={run.report} />}
      <Basis compact />
      <p class="muted">
        Registry last checked against vendor pages on {BOTS_CHECKED}. JavaScript column follows the study above ({RENDER_STUDY.date}).
      </p>
    </>
  );
}
