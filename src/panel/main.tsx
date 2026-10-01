import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { runBotCheck, type BotRun } from "./botrun";
import { stripHash, type OkReport } from "./metrics";
import { analyseTab, disconnectContent, isAnalyseMessage, type Phase } from "./session";
import { BotsView } from "./views/Bots";
import { FieldsView } from "./views/Fields";
import { ShareView } from "./views/Share";
import { Gate, XRayView } from "./views/XRay";
import type { Snapshot } from "../messages";

const PURPOSE = "Show what an AI crawler that does not run JavaScript receives from this page, compared with what the browser renders.";

const TABS = [
  { id: "xray", label: "X-Ray" },
  { id: "fields", label: "Fields" },
  { id: "bots", label: "Bots" },
  { id: "share", label: "Share" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function dataStatus(phase: Phase): string {
  if (phase.status !== "analysed") return phase.status;
  return phase.report.ok ? "ready" : "gate";
}

function StatusMessage({ phase }: { phase: Exclude<Phase, { status: "analysed" }> }) {
  switch (phase.status) {
    case "loading":
      return (
        <p class="progress" role="status">
          {phase.step}
        </p>
      );
    case "no-access":
      return <p class="empty">Click the toolbar icon to analyse this tab</p>;
    case "unsupported":
      return <p class="empty">{phase.reason}</p>;
    case "error":
      return (
        <p class="error" role="alert">
          Analysis failed: {phase.message}
        </p>
      );
    case "idle":
      return <p class="empty">Click the toolbar icon to analyse this tab</p>;
  }
}

function Tabs({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
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
        >
          {t.label}
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
  const [tab, setTab] = useState<TabId>("xray");
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [bots, setBots] = useState<BotRun>({ status: "idle" });
  const tracked = useRef<number | null>(null);
  const manifest = chrome.runtime.getManifest();

  const run = useCallback(async (tabId: number) => {
    tracked.current = tabId;
    setLiveUrl(null);
    setBots({ status: "idle" });
    setPhase({ status: "loading", step: "Fetching server HTML…" });
    const outcome = await analyseTab(tabId, (step) => {
      setPhase({ status: "loading", step });
    });
    if (outcome) setPhase(outcome);
  }, []);

  useEffect(() => {
    document.title = manifest.name;
    void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => {
      if (active?.id === undefined) setPhase({ status: "no-access" });
      else void run(active.id);
    });
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
  }, [run, manifest.name]);

  const analysed = phase.status === "analysed" ? phase : null;
  const ok: { report: OkReport; snapshot: Snapshot } | null = analysed?.report.ok ? { report: analysed.report, snapshot: analysed.snapshot } : null;
  const changed = analysed !== null && liveUrl !== null && stripHash(liveUrl) !== stripHash(analysed.snapshot.url) ? analysed : null;
  const unavailable = phase.status === "analysed" ? null : <StatusMessage phase={phase} />;
  const needsOk = (view: ComponentChildren) => unavailable ?? (ok ? view : <p class="empty">No comparison is available; see the X-Ray tab.</p>);

  const startBotCheck = () => {
    if (!analysed) return;
    setBots({ status: "running" });
    runBotCheck(analysed.snapshot).then(
      (report) => {
        setBots({ status: "done", report });
      },
      (e: unknown) => {
        setBots({ status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
  };

  return (
    <div id="app" data-status={dataStatus(phase)}>
      <header class="top">
        <h1>{manifest.name}</h1>
        <p class="purpose">{PURPOSE}</p>
      </header>
      <Tabs active={tab} onSelect={setTab} />
      {changed && (
        <div class="stale" role="status">
          <span>Page changed since analysis</span>
          <button
            type="button"
            onClick={() => {
              void run(changed.tabId);
            }}
          >
            Re-analyse
          </button>
        </div>
      )}
      <main>
        <Panel id="xray" active={tab}>
          {unavailable ?? (ok ? <XRayView report={ok.report} snapshot={ok.snapshot} /> : analysed && !analysed.report.ok ? <Gate failure={analysed.report.gate} /> : null)}
        </Panel>
        <Panel id="fields" active={tab}>
          {needsOk(ok && <FieldsView report={ok.report} />)}
        </Panel>
        <Panel id="bots" active={tab}>
          {unavailable ?? <BotsView run={bots} onRun={startBotCheck} />}
        </Panel>
        <Panel id="share" active={tab}>
          {needsOk(ok && <ShareView report={ok.report} snapshot={ok.snapshot} product={manifest.name} version={manifest.version} />)}
        </Panel>
      </main>
      <footer>
        {manifest.name} · Free &amp; open source ·{" "}
        <a href="https://missiongrowth.io" target="_blank" rel="noreferrer">
          MissionGrowth
        </a>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Panel root element is missing.");
render(<App />, root);
