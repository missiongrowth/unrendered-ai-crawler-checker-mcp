import type { BotReport } from "../../src/core/botcheck";
import { BOTS } from "../../src/data/bots";
import type { ProbeAgent } from "../../src/messages";
import { newContext, openCore, withChrome } from "./browser";
import { runProbe } from "./probe";

/** Used when the page was not loaded in a browser to read `document.characterSet`; it only matters for servers that declare no encoding. */
const FALLBACK_CHARSET = "utf-8";

const agents: ProbeAgent[] = BOTS.flatMap((b) => (b.userAgent === null ? [] : [{ token: b.token, userAgent: b.userAgent }]));

/** The panel's flow: one probe, then a second probe for the bots that got a different page, whose answer stands. */
export function checkBots(url: string): Promise<BotReport> {
  return withChrome(async (session) => {
    const core = await openCore(await newContext(session));
    const probe = (list: readonly ProbeAgent[]) => runProbe(url, FALLBACK_CHARSET, list, session.userAgent).then((reply) => core.botReport(reply, url));
    const first = await probe(agents);
    const retest = new Set(first.rows.flatMap((r) => (r.probe?.verdict.kind === "different" ? [r.bot.token] : [])));
    if (retest.size === 0) return first;
    const again = await probe(agents.filter((a) => retest.has(a.token)));
    return {
      ...first,
      rows: first.rows.map((r) => {
        const probe = retest.has(r.bot.token) ? again.rows.find((x) => x.bot.token === r.bot.token)?.probe : undefined;
        return probe === undefined ? r : { ...r, probe };
      }),
    };
  });
}
