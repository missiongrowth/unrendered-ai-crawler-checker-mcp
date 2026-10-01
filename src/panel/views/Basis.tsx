import { RENDER_STUDY } from "../../data/bots";

export function Basis({ compact = false }: { compact?: boolean }) {
  return (
    <p class="basis">
      {compact ? "Basis" : "Basis for what AI crawlers do with JavaScript"}: third-party study, not a vendor statement. {RENDER_STUDY.publisher},{" "}
      <a href={RENDER_STUDY.url} target="_blank" rel="noreferrer">
        {RENDER_STUDY.title}
      </a>{" "}
      ({RENDER_STUDY.date}): “{RENDER_STUDY.quote}”
    </p>
  );
}
