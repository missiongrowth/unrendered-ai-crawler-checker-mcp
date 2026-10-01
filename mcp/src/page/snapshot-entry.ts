import { takeSnapshot } from "../../../src/content/snapshot";
import type { Snapshot } from "../../../src/messages";
import { SNAPSHOT_FN } from "../globals";

// A closed shadow root has no `shadowRoot` property; only the extension API can open it.
const snapshot = async (crawlerTokens: string[]): Promise<Snapshot> => (await takeSnapshot(crawlerTokens, (el) => el.shadowRoot)).snapshot;

Reflect.set(globalThis, SNAPSHOT_FN, snapshot);
