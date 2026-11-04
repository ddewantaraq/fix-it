import type { SessionSummary } from "@iklim-pal/shared";
import { statusPillLabel } from "../lib/labels";

export function PlansHome({
  summaries,
  openingId,
  onOpen,
}: {
  summaries: SessionSummary[];
  openingId: string | null;
  onOpen: (id: string) => void;
}) {
  const activeList = summaries.filter((s) => s.status === "active" && s.hasPlan);
  const pastList = summaries.filter(
    (s) => s.hasPlan && (s.status === "done" || s.status === "escalated"),
  );
  const otherWithPlan = summaries.filter(
    (s) => s.hasPlan && s.status !== "active" && s.status !== "done" && s.status !== "escalated",
  );
  const listed = [...activeList, ...otherWithPlan, ...pastList];

  function Section({
    title,
    items,
  }: {
    title: string;
    items: SessionSummary[];
  }) {
    if (items.length === 0) return null;
    return (
      <section className="plans-section">
        <h2>{title}</h2>
        <ul className="plans-list">
          {items.map((item) => {
            const opening = openingId === item.id;
            const titleText = item.goal || item.concernText || "Untitled plan";
            const concernLine =
              item.goal && item.concernText && item.concernText !== item.goal
                ? item.concernText
                : null;
            return (
              <li key={item.id}>
                <article
                  className={item.status === "escalated" ? "plan-card is-alert" : "plan-card"}
                >
                  <div className="plan-card-body">
                    <div className="plan-card-top">
                      <p className="kicker">{item.city || "Place TBD"}</p>
                      <span
                        className={
                          item.status === "escalated" ? "status-pill is-alert" : "status-pill"
                        }
                      >
                        {statusPillLabel(item.status)}
                      </span>
                    </div>
                    <h3>{titleText}</h3>
                    {concernLine && <p className="plan-card-concern">{concernLine}</p>}
                    <div className="plan-card-progress" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, item.progressPct)}%` }} />
                    </div>
                    <p className="meta">{item.progressPct}% complete</p>
                  </div>
                  <button
                    className="primary is-compact"
                    type="button"
                    disabled={opening}
                    aria-busy={opening}
                    onClick={() => onOpen(item.id)}
                  >
                    {opening ? "Opening…" : "Open plan"}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="plans-home">
      {listed.length === 0 ? (
        <p className="hint">No plans yet. Capture a litter photo to create one.</p>
      ) : (
        <>
          <Section title="Active" items={[...activeList, ...otherWithPlan]} />
          <Section title="Past" items={pastList} />
        </>
      )}
    </div>
  );
}
