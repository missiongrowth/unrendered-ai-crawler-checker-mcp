import type { BotReport, BotRow, ProbeVerdict } from "../../core/botcheck";
import type { RobotsFetch, RobotsVerdict } from "../../core/robots";
import { BOTS_CHECKED, RENDER_STUDY, type Bot } from "../../data/bots";
import { probedAgents, type BotRun } from "../botrun";
import { CLASS_LABEL } from "../copy";
import { IconChevronRight } from "../icons";
import { Badge, ExternalLink } from "./ui";

/** Probed by no one on purpose: the extension does not send these user-agents. */
const NOT_IMITATED: ReadonlySet<string> = new Set(["Googlebot", "Applebot"]);

const pct = (n: number) => String(Math.round(n * 100));

function robotsReason(v: RobotsVerdict, fetched: RobotsFetch): string {
  switch (v.reason) {
    case "rules":
      return `matched line ${String(v.line)}`;
    case "no-matching-rule":
      return "no rule matches this URL";
    case "4xx-allow-all":
      return `robots.txt returned HTTP ${"status" in fetched ? String(fetched.status) : ""}, which means everything is allowed (RFC 9309)`;
    case "5xx-disallow-all":
      return `robots.txt returned HTTP ${"status" in fetched ? String(fetched.status) : ""}, which means everything is blocked (RFC 9309)`;
    case "unreachable-disallow-all":
      return `robots.txt could not be fetched: ${"error" in fetched ? fetched.error : ""}. RFC 9309 treats this as everything blocked.`;
  }
}

function ResponseBadge({ verdict }: { verdict: ProbeVerdict | null }) {
  if (verdict === null) return <Badge tone="plain">Not tested</Badge>;
  switch (verdict.kind) {
    case "same":
      return (
        <Badge tone="ok" title={`${pct(verdict.similarity)}% word overlap with a normal request`}>
          Same page
        </Badge>
      );
    case "different":
      return (
        <Badge tone="warn" title={`${pct(verdict.similarity)}% word overlap with a normal request`}>
          Different page
        </Badge>
      );
    case "challenged":
      return <Badge tone="bad">Challenge page</Badge>;
    case "rate-limited":
      return <Badge tone="warn">Rate-limited (429)</Badge>;
    case "blocked":
      return <Badge tone="bad">HTTP {verdict.status}</Badge>;
    case "redirected-elsewhere":
      return (
        <Badge tone="warn" title={verdict.finalUrl}>
          Redirected
        </Badge>
      );
    case "error":
      return (
        <Badge tone="bad" title={verdict.detail}>
          Request failed
        </Badge>
      );
  }
}

function untested(bot: Bot, product: string): string {
  if (NOT_IMITATED.has(bot.token)) return `Not tested: ${product} does not imitate ${bot.token}.`;
  if (bot.class === "control-token") return "Not tested: this token only controls how crawled data is used. It never fetches pages.";
  return "Not tested: no verified user-agent string yet.";
}

function jsLine(bot: Bot): string {
  if (bot.rendersJs === null) return "Runs JavaScript: not measured";
  return `Runs JavaScript: ${bot.rendersJs ? "yes" : "no"} (${RENDER_STUDY.publisher} ${RENDER_STUDY.date})`;
}

function BotLine({ row, fetched, product }: { row: BotRow; fetched: RobotsFetch; product: string }) {
  const { bot, robots, probe } = row;
  return (
    <details class="bot-row" data-bot={bot.token} data-verdict={probe?.verdict.kind ?? "not-probed"} data-robots={robots.allowed ? "allowed" : "disallowed"}>
      <summary class="hover-row">
        <IconChevronRight />
        <span class="bot-id">
          <span class="bot-token">{bot.token}</span>
          <span class="muted">
            {bot.vendor} · {CLASS_LABEL[bot.class]}
          </span>
        </span>
        <span class="badges">
          {robots.allowed ? <Badge tone="ok">Allowed</Badge> : <Badge tone="bad">Blocked by robots.txt</Badge>}
          <ResponseBadge verdict={probe?.verdict ?? null} />
          {probe?.noindex === true && <Badge tone="warn">noindex</Badge>}
        </span>
      </summary>
      <div class="bot-details">
        <p>robots.txt: {robotsReason(robots, fetched)}</p>
        {robots.lineText !== null && <code class="line">{robots.lineText}</code>}
        {bot.userAgent === null ? (
          <p>{untested(bot, product)}</p>
        ) : (
          <>
            <p>User-agent sent:</p>
            <code class="line">{bot.userAgent}</code>
            {bot.userAgentSeen && (
              <p class="muted">
                {bot.vendor} publishes the token only. This string was seen in server logs on {bot.userAgentSeen.date}, from IP ranges in{" "}
                <ExternalLink href={bot.userAgentSeen.ipList}>{bot.vendor}'s published list</ExternalLink>.
              </p>
            )}
          </>
        )}
        <p>{jsLine(bot)}</p>
        {bot.robotsNote !== null && <blockquote>{bot.robotsNote}</blockquote>}
        <ExternalLink href={bot.docUrl}>{bot.vendor} documentation</ExternalLink>
      </div>
    </details>
  );
}

function Signals({ report }: { report: BotReport }) {
  if (report.contentSignals.length === 0 || "error" in report.robots) return null;
  const lines = report.robots.body.split(/\r\n|\r|\n/);
  return (
    <section>
      <h2>Content signals in robots.txt</h2>
      <ul class="signals">
        {report.contentSignals.map((s) => (
          <li key={s.line}>
            <code class="line">{lines[s.line - 1]?.trim() ?? s.value}</code>
            <span class="muted">
              line {s.line}
              {s.agents.length > 0 ? ` · for ${s.agents.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BotsView({ run, onRun, product, host }: { run: BotRun; onRun: () => void; product: string; host: string }) {
  const running = run.status === "running";
  return (
    <>
      <section class="bots-start">
        <p>Check robots.txt and how the site answers each AI bot's user-agent.</p>
        <div class="actions">
          <button type="button" class="btn primary" disabled={running} onClick={onRun}>
            Check bots
          </button>
          <span class="muted" role="status">
            {running ? `Checking robots.txt and ${String(probedAgents().length)} user-agents…` : ""}
          </span>
        </div>
        {run.status === "idle" && <p class="muted">Chrome will ask to let {product} access {host}. It's needed to send requests with other user-agents.</p>}
        {run.status === "denied" && (
          <p class="error" role="alert">
            Access to {run.host} was not allowed, so the bot check can't run.
          </p>
        )}
        {run.status === "error" && (
          <p class="error" role="alert">
            {run.message}
          </p>
        )}
        <p class="caveat muted">Requests come from your IP with each bot's published user-agent. Sites that verify bots by IP may answer the real bot differently.</p>
      </section>
      {run.status === "done" && (
        <>
          <div class="rows">
            {run.report.rows.map((row) => (
              <BotLine key={row.bot.token} row={row} fetched={run.report.robots} product={product} />
            ))}
          </div>
          <Signals report={run.report} />
        </>
      )}
      <p class="muted">User-agents copied from vendor pages on {BOTS_CHECKED}.</p>
    </>
  );
}
