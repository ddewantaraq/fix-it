import type { SessionDetail } from "@iklim-pal/shared";
import { PlanSheet } from "../components/PlanSheet";

export function PlanDetailPage({
  error,
  busy,
  planDetail,
  onBackToPlans,
  onNewConcern,
  onToggleStep,
}: {
  error: string | null;
  busy: boolean;
  planDetail: SessionDetail;
  onBackToPlans: () => void;
  onNewConcern: () => void;
  onToggleStep: (order: number, checked: boolean) => void;
}) {
  return (
    <main className="workspace">
      <div className="workspace-head plans-workspace-head">
        <button className="chip" type="button" onClick={onBackToPlans}>
          ← All plans
        </button>
        <button className="primary is-compact" type="button" onClick={onNewConcern}>
          New concern
        </button>
      </div>
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
      <div className="layout">
        <aside className="rail">
          {planDetail.session.photoUrl && (
            <img src={planDetail.session.photoUrl} alt="Litter concern" />
          )}
          <h2>{planDetail.session.city || "Your neighborhood"}</h2>
          <dl>
            <dt>Concern</dt>
            <dd>{planDetail.session.concernText || "—"}</dd>
            <dt>Status</dt>
            <dd>{planDetail.session.status}</dd>
          </dl>
        </aside>
        <div className="stage">
          {planDetail.plan ? (
            <PlanSheet
              plan={planDetail.plan}
              shareCardUrl={planDetail.shareCardUrl ?? null}
              escalated={planDetail.session.status === "escalated"}
              progressOrders={planDetail.progress?.completedStepOrders ?? []}
              onToggleStep={
                planDetail.session.status === "active" ||
                planDetail.session.status === "done" ||
                planDetail.session.status === "escalated"
                  ? onToggleStep
                  : undefined
              }
              busy={busy}
            />
          ) : (
            <p className="hint">No action plan on this session yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
