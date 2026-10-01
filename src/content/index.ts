import { CONTENT_PORT } from "../messages";
import type { ContentReply, ContentRequest } from "../messages";
import { clearOverlay, reveal, setOverlay } from "./overlay";
import { takeSnapshot } from "./snapshot";
import type { BlockIndex } from "./snapshot";

const INSTALLED = "__unrenderedContentInstalled";

function install(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== CONTENT_PORT) return;
    let connected = true;
    let index: BlockIndex | null = null;

    const reply = (message: ContentReply): void => {
      if (connected) port.postMessage(message);
    };

    const snapshot = async (crawlerTokens: string[]): Promise<void> => {
      try {
        const result = await takeSnapshot(crawlerTokens);
        index = result.index;
        reply({ type: "snapshot", snapshot: result.snapshot });
      } catch (e) {
        reply({ type: "snapshot-error", error: e instanceof Error ? e.message : String(e) });
      }
    };

    port.onMessage.addListener((message: ContentRequest) => {
      switch (message.type) {
        case "snapshot":
          void snapshot(message.crawlerTokens);
          break;
        case "overlay":
          setOverlay(message.states, index?.visible ?? new Map());
          break;
        case "reveal": {
          const el = index?.all.get(message.id);
          if (el) reveal(el);
          break;
        }
      }
    });

    port.onDisconnect.addListener(() => {
      connected = false;
      index = null;
      clearOverlay();
    });
  });
}

if (!Reflect.get(globalThis, INSTALLED)) {
  Reflect.set(globalThis, INSTALLED, true);
  install();
}
