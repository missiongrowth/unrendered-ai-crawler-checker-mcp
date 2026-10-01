import { analyze } from "../../../src/core/analyze";
import { botReport } from "../../../src/core/botcheck";
import { CORE_FN } from "../globals";

/** Only the report's summary leaves the page; the server HTML it carries for the panel's raw view is dropped. */
const slimAnalyze: typeof analyze = (snapshot, crawlerTokens) => {
  const report = analyze(snapshot, crawlerTokens);
  return report.ok ? { ...report, serverHtml: "" } : report;
};

// `Document.parseHTMLUnsafe` is needed, so this runs in a blank browser page, as it does in the extension panel.
Reflect.set(globalThis, CORE_FN, { analyze: slimAnalyze, botReport });
