export interface LogEntry {
  port: number;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface FixtureServers {
  origins: Record<"main" | "other" | "robots500" | "robots404" | "robotsRedirect", string>;
  /** Every request any origin received since start or the last `reset`, in arrival order. */
  log: () => LogEntry[];
  /** Clears the request log and the per-request counters (`/p/ab-parity`). */
  reset: () => void;
  close: () => Promise<void>;
}

export function startFixtureServers(basePort?: number): Promise<FixtureServers>;
