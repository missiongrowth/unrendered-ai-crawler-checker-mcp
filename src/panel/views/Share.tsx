import { useMemo, useRef, useState } from "preact/hooks";
import type { Snapshot } from "../../messages";
import { STATES } from "../../states";
import { HERO_SUB, NO_MAIN_TEXT, wordsOf } from "../copy";
import { heroText, renderGroups, topMissing, wordsOnlyAfterJs, type OkReport } from "../metrics";
import { CARD_HEIGHT, CARD_WIDTH, drawCard } from "../share/card";
import { markdownReport, summaryLine } from "../share/markdown";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function captureTab(): Promise<HTMLImageElement | null> {
  try {
    const image = new Image();
    image.src = await chrome.tabs.captureVisibleTab({ format: "png" });
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("The image could not be encoded."));
    }, "image/png");
  });

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
}

export function ShareView({ report, snapshot, product }: { report: OkReport; snapshot: Snapshot; product: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [message, setMessage] = useState("");
  const markdown = useMemo(() => markdownReport(report, snapshot, product), [report, snapshot, product]);
  const summary = useMemo(() => summaryLine(report), [report]);

  const run = (task: () => Promise<string>) => {
    void task().then(setMessage, (e: unknown) => {
      setMessage(messageOf(e));
    });
  };

  const create = async () => {
    const el = canvas.current;
    if (!el) return "";
    const shot = await captureTab();
    const words = wordsOnlyAfterJs(report);
    await drawCard(
      el,
      {
        url: report.url,
        eyebrow: "RAW HTML VS RENDERED HTML",
        mainPercent: heroText(report.main),
        heroLine: HERO_SUB,
        segments: renderGroups(report).map((g) => ({ color: STATES[g.state].color, share: g.percent / 100, striped: g.id === "data" })),
        mainWords: wordsOf(report.main.credited, report.main.total),
        onlyRendered: `${String(words)} words only in rendered HTML`,
        onlyRenderedColor: STATES["js-added"].color,
        missing: topMissing(report, 3).map((b) => clip(b.text, 60)),
        screenshot: shot,
        footer: `${product} by MissionGrowth`,
      },
      shot ? { width: shot.naturalWidth, height: shot.naturalHeight } : null,
    );
    setDrawn(true);
    return shot ? "" : "Created without a page screenshot.";
  };

  const download = async () => {
    const url = URL.createObjectURL(await toBlob(canvas.current ?? document.createElement("canvas")));
    const a = document.createElement("a");
    a.href = url;
    a.download = `raw-vs-rendered-html-${new URL(report.url).hostname}.png`;
    a.click();
    URL.revokeObjectURL(url);
    return "Image downloaded";
  };

  const copyImage = async () => {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": toBlob(canvas.current ?? document.createElement("canvas")) })]);
    return "Image copied";
  };

  const copyText = (text: string, done: string) => async () => {
    await navigator.clipboard.writeText(text);
    return done;
  };

  if (report.main.total === 0) return <p class="muted">{NO_MAIN_TEXT}</p>;
  return (
    <>
      <section>
        <div class="section-head">
          <h2>Image (1200 × 630)</h2>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" onClick={() => { run(create); }}>
            Create image
          </button>
          <button type="button" class="btn" disabled={!drawn} onClick={() => { run(download); }}>
            Download PNG
          </button>
          <button type="button" class="btn" disabled={!drawn} onClick={() => { run(copyImage); }}>
            Copy image
          </button>
        </div>
        <canvas ref={canvas} class="card-preview" width={CARD_WIDTH} height={CARD_HEIGHT} hidden={!drawn} aria-label="Image (1200 × 630)" />
      </section>
      <section class="share-text">
        <p class="summary">{summary}</p>
        <div class="actions">
          <button type="button" class="btn" onClick={() => { run(copyText(summary, "Summary copied")); }}>
            Copy summary
          </button>
          <button type="button" class="btn" onClick={() => { run(copyText(markdown, "Report copied")); }}>
            Copy Markdown report
          </button>
        </div>
      </section>
      <p class="muted" role="status">
        {message}
      </p>
    </>
  );
}
