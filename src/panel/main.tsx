import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { AccessDenied, runBotCheck, type BotRun } from "./botrun";
import { IconRefresh } from "./icons";
import { differsCount, stripHash, type OkReport } from "./metrics";
import { analyseTab, disconnectContent, isAnalyseMessage, type Phase } from "./session";
import { BotsView } from "./views/Bots";
import { FieldsView } from "./views/Fields";
import { ShareView } from "./views/Share";
import { ContentView, Gate } from "./views/Content";
import type { Snapshot } from "../messages";

const TABS = [
  { id: "content", label: "Content" },
  { id: "fields", label: "Fields" },
  { id: "bots", label: "Bots" },
  { id: "share", label: "Share" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function dataStatus(phase: Phase): string {
  if (phase.status !== "analysed") return phase.status;
  return phase.report.ok ? "ready" : "gate";
}

function StatusMessage({ phase, product, onRetry }: { phase: Exclude<Phase, { status: "analysed" }>; product: string; onRetry: () => void }) {
  switch (phase.status) {
    case "loading":
      return (
        <p class="progress" role="status">
          <span class="spinner" aria-hidden="true" />
          {phase.step}
        </p>
      );
    case "unsupported":
      return (
        <section class="empty">
          <h2>This page can't be analysed</h2>
          <p>{product} works on http and https pages only.</p>
        </section>
      );
    case "error":
      return (
        <section class="empty" role="alert">
          <h2>Analysis failed</h2>
          <p>{phase.message}</p>
          <button type="button" class="btn" onClick={onRetry}>
            Try again
          </button>
        </section>
      );
    case "no-access":
    case "idle":
      return (
        <section class="empty">
          <h2>Click the {product} icon to analyse this tab</h2>
          <p>The extension reads a tab only after you click its icon. Chrome does not let extensions read its own pages (chrome://), the Chrome Web Store or PDFs opened in Chrome.</p>
        </section>
      );
  }
}

const TAIL = 12;

/** CSS can only cut the end of a string, so the last characters live in their own span. */
function MiddleTruncate({ text }: { text: string }) {
  const head = text.length > TAIL ? text.slice(0, -TAIL) : text;
  const tail = text.length > TAIL ? text.slice(-TAIL) : "";
  return (
    <span class="middle" title={text}>
      <span class="middle-head">{head}</span>
      <span class="middle-tail">{tail}</span>
    </span>
  );
}

function hostAndPath(url: string): string {
  const { host, pathname } = new URL(url);
  return `${host}${pathname}`;
}

function statusLine(report: OkReport, snapshot: Snapshot): string {
  const seconds = (snapshot.settleMs / 1000).toFixed(1);
  return `HTTP ${String(report.status)} · ${snapshot.settled ? "settled in" : "still changing at"} ${seconds} s`;
}

function Tabs({ active, onSelect, fieldCount }: { active: TabId; onSelect: (t: TabId) => void; fieldCount: number | null }) {
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const target = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + step + TABS.length) % TABS.length;
    if (step === 0 && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = TABS[target];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div class="tabs" role="tablist" aria-label="Views">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => {
            onSelect(t.id);
          }}
          onKeyDown={(e) => {
            onKeyDown(e, i);
          }}
          aria-label={t.label}
        >
          {t.label}
          {t.id === "fields" && fieldCount !== null && fieldCount > 0 && (
            <span class="count-badge num" aria-hidden="true">
              {fieldCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Panel({ id, active, children }: { id: TabId; active: TabId; children: ComponentChildren }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={active !== id} tabIndex={0}>
      {children}
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const [tab, setTab] = useState<TabId>("content");
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [bots, setBots] = useState<BotRun>({ status: "idle" });
  const tracked = useRef<number | null>(null);
  const manifest = chrome.runtime.getManifest();
  const product = manifest.short_name ?? manifest.name;

  const run = useCallback(async (tabId: number) => {
    tracked.current = tabId;
    setLiveUrl(null);
    setBots({ status: "idle" });
    setPhase({ status: "loading", step: "Waiting for the page to settle…" });
    const outcome = await analyseTab(tabId, (step) => {
      setPhase({ status: "loading", step });
    });
    if (outcome) setPhase(outcome);
  }, []);

  const rerun = useCallback(() => {
    if (tracked.current !== null) {
      void run(tracked.current);
      return;
    }
    void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => {
      if (active?.id === undefined) setPhase({ status: "no-access" });
      else void run(active.id);
    });
  }, [run]);

  useEffect(() => {
    document.title = product;
    rerun();
    const onMessage = (message: unknown) => {
      if (isAnalyseMessage(message)) void run(message.tabId);
    };
    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (info.tabId === tracked.current) return;
      tracked.current = null;
      disconnectContent();
      setBots({ status: "idle" });
      setPhase({ status: "no-access" });
    };
    const onUpdated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (tabId === tracked.current && change.url !== undefined) setLiveUrl(change.url);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [run, rerun, product]);

  const analysed = phase.status === "analysed" ? phase : null;
  const ok: { report: OkReport; snapshot: Snapshot } | null = analysed?.report.ok ? { report: analysed.report, snapshot: analysed.snapshot } : null;
  const changed = analysed !== null && liveUrl !== null && stripHash(liveUrl) !== stripHash(analysed.snapshot.url) ? analysed : null;
  const unavailable = phase.status === "analysed" ? null : <StatusMessage phase={phase} product={product} onRetry={rerun} />;
  const gated = analysed && !analysed.report.ok ? <Gate failure={analysed.report.gate} /> : null;
  const needsOk = (view: ComponentChildren) => unavailable ?? (ok ? view : gated);

  const startBotCheck = () => {
    if (!analysed) return;
    setBots({ status: "running" });
    runBotCheck(analysed.snapshot).then(
      (report) => {
        setBots({ status: "done", report });
      },
      (e: unknown) => {
        setBots(e instanceof AccessDenied ? { status: "denied", host: e.host } : { status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
  };

  return (
    <div id="app" data-status={dataStatus(phase)}>
      <header class="brand">
        <img src="icons/icon-32.png" width="20" height="20" alt="" />
        <span class="brand-name">{product}</span>
        <button type="button" class="icon-btn hover-row" aria-label="Analyse again" title="Analyse again" disabled={phase.status === "loading"} onClick={rerun}>
          <IconRefresh />
        </button>
      </header>
      {analysed && (
        <div class="page">
          <h1>
            <MiddleTruncate text={hostAndPath(analysed.snapshot.url)} />
          </h1>
          {ok && <p class="status-line num">{statusLine(ok.report, ok.snapshot)}</p>}
        </div>
      )}
      <Tabs active={tab} onSelect={setTab} fieldCount={ok ? differsCount(ok.report) : null} />
      {changed && (
        <div class="stale" role="status">
          <span>The page changed since the analysis.</span>
          <button type="button" class="btn small" onClick={rerun}>
            Analyse again
          </button>
        </div>
      )}
      <main>
        <Panel id="content" active={tab}>
          {unavailable ?? (ok ? <ContentView report={ok.report} snapshot={ok.snapshot} /> : gated)}
        </Panel>
        <Panel id="fields" active={tab}>
          {needsOk(ok && <FieldsView report={ok.report} />)}
        </Panel>
        <Panel id="bots" active={tab}>
          {unavailable ?? (analysed && <BotsView run={bots} onRun={startBotCheck} product={product} host={new URL(analysed.snapshot.url).host} />)}
        </Panel>
        <Panel id="share" active={tab}>
          {needsOk(ok && <ShareView report={ok.report} snapshot={ok.snapshot} product={product} />)}
        </Panel>
      </main>
      <footer>
        <img src="icons/mission-growth.svg" width="14" height="17" alt="" />
        <span>
          Made by{" "}
          <a href="https://missiongrowth.io" target="_blank" rel="noreferrer">
            Mission Growth
          </a>{" "}
          · Free and open source
        </span>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Panel root element is missing.");
render(<App />, root);
