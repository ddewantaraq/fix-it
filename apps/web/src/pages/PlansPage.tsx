import type { SessionSummary } from "@iklim-pal/shared";
import { PlansHome } from "../components/PlansHome";

export function PlansPage({
  busy,
  error,
  summaries,
  openingId,
  onRefresh,
  onBack,
  onNewConcern,
  onOpen,
}: {
  busy: boolean;
  error: string | null;
  summaries: SessionSummary[];
  openingId: string | null;
  onRefresh: () => void;
  onBack: () => void;
  onNewConcern: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <main className="workspace">
      <div className="workspace-head plans-workspace-head">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="plans-title">Your plans</h1>
        </div>
        <div className="plans-head-actions">
          <button className="chip" type="button" disabled={busy} onClick={onRefresh}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
          <button className="chip" type="button" onClick={onBack}>
            Back
          </button>
          <button className="primary is-compact" type="button" onClick={onNewConcern}>
            New concern
          </button>
        </div>
      </div>
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
      <PlansHome summaries={summaries} openingId={openingId} onOpen={onOpen} />
    </main>
  );
}
