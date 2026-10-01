import { useMemo, useRef, useState } from "preact/hooks";
import type { Snapshot } from "../../messages";
import { percentText, topMissing, wordsOnlyAfterJs, type OkReport } from "../metrics";
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

export function ShareView({ report, snapshot, product, version }: { report: OkReport; snapshot: Snapshot; product: string; version: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [message, setMessage] = useState("");
  const markdown = useMemo(() => markdownReport(report, snapshot, product, version), [report, snapshot, product, version]);

  const run = (task: () => Promise<string>) => {
    void task().then(setMessage, (e: unknown) => {
      setMessage(messageOf(e));
    });
  };

  const create = async () => {
    const el = canvas.current;
    if (!el) return "";
    const shot = await captureTab();
    drawCard(
      el,
      {
        url: report.url,
        mainPercent: percentText(report.main),
        mainWords: `${report.main.credited} of ${report.main.total} words`,
        wordsOnlyAfterJs: wordsOnlyAfterJs(report),
        missing: topMissing(report, 3).map((b) => clip(b.text, 70)),
        screenshot: shot,
        footer: `Made with ${product} by MissionGrowth`,
      },
      shot ? { width: shot.naturalWidth, height: shot.naturalHeight } : null,
    );
    setDrawn(true);
    return shot ? "Image created." : "Image created without a screenshot of the page.";
  };

  const download = async () => {
    const url = URL.createObjectURL(await toBlob(canvas.current ?? document.createElement("canvas")));
    const a = document.createElement("a");
    a.href = url;
    a.download = `server-html-vs-rendered-${new URL(report.url).hostname}.png`;
    a.click();
    URL.revokeObjectURL(url);
    return "Image downloaded.";
  };

  const copyImage = async () => {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": toBlob(canvas.current ?? document.createElement("canvas")) })]);
    return "Image copied.";
  };

  const copyText = (text: string, done: string) => async () => {
    await navigator.clipboard.writeText(text);
    return done;
  };

  return (
    <>
      <section>
        <h2>Image</h2>
        <p class="muted">A 1200×630 card with the URL, main-content coverage, the largest missing blocks and a screenshot of the visible tab.</p>
        <div class="toolbar">
          <button type="button" class="primary" onClick={() => { run(create); }}>
            Create image
          </button>
          <button type="button" disabled={!drawn} onClick={() => { run(download); }}>
            Download PNG
          </button>
          <button type="button" disabled={!drawn} onClick={() => { run(copyImage); }}>
            Copy image
          </button>
        </div>
        <canvas ref={canvas} class="card" width={CARD_WIDTH} height={CARD_HEIGHT} hidden={!drawn} aria-label="Share card preview" />
      </section>
      <section>
        <h2>Text</h2>
        <div class="toolbar">
          <button type="button" onClick={() => { run(copyText(markdown, "Markdown report copied.")); }}>
            Copy Markdown report
          </button>
          <button type="button" onClick={() => { run(copyText(summaryLine(report), "Summary copied.")); }}>
            Copy summary
          </button>
        </div>
        <p class="summary">{summaryLine(report)}</p>
        <details>
          <summary>Markdown preview</summary>
          <pre class="markdown">{markdown}</pre>
        </details>
      </section>
      <p class="muted" role="status">
        {message}
      </p>
    </>
  );
}
