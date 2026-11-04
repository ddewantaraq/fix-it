import { useState } from "react";
import type { ActionPlan } from "@iklim-pal/shared";
import { OWNER_LABEL, RECOMMENDATION_LABEL } from "../lib/labels";
import { PhaseIcon } from "./PhaseIcon";

export function PlanSheet({
  plan,
  shareCardUrl,
  escalated,
  progressOrders,
  onToggleStep,
  busy,
}: {
  plan: ActionPlan;
  shareCardUrl?: string | null;
  escalated: boolean;
  progressOrders?: number[];
  onToggleStep?: (order: number, checked: boolean) => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [linkToCopy, setLinkToCopy] = useState<string | null>(null);
  const done = new Set(progressOrders ?? []);
  const pct =
    plan.steps.length === 0
      ? 0
      : Math.min(100, Math.round((done.size / plan.steps.length) * 100));

  async function onCopyLink() {
    if (!shareCardUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareCardUrl);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setCopied(true);
      setLinkToCopy(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setLinkToCopy(shareCardUrl);
    }
  }

  return (
    <article className={escalated ? "plan-sheet is-alert" : "plan-sheet"}>
      <div className="phase-head">
        <p className="kicker">
          <PhaseIcon id="plan" />
          Your plan
        </p>
        <h2>{plan.goal}</h2>
      </div>
      <p className="rec">{RECOMMENDATION_LABEL[plan.recommendation] ?? plan.recommendation}</p>
      {onToggleStep && <p className="meta progress-line">Progress {pct}%</p>}
      <ol className="steps">
        {plan.steps.map((item) => (
          <li key={`${item.order}-${item.title}`}>
            {onToggleStep ? (
              <label className="step-check">
                <input
                  type="checkbox"
                  checked={done.has(item.order)}
                  disabled={busy}
                  onChange={(event) => onToggleStep(item.order, event.target.checked)}
                />
                <span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <p className="meta">
                    {OWNER_LABEL[item.owner] ?? item.owner} · {item.timeboxMinutes} min
                  </p>
                </span>
              </label>
            ) : (
              <>
                <span className="step-index">{item.order}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <p className="meta">
                    {OWNER_LABEL[item.owner] ?? item.owner} · {item.timeboxMinutes} min
                  </p>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="facts">
        <section>
          <h3>Materials</h3>
          <ul>
            {plan.materials.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Measure</h3>
          <ul>
            {plan.measureHow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className="safety">
        <h3>Safety</h3>
        <ul>
          {plan.safetyNotes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="uncertainty">
        <h3>Uncertainty</h3>
        <ul>
          {plan.uncertainty.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {shareCardUrl && (
        <figure className="share-card">
          <div className="share-head">
            <h3>
              <PhaseIcon id="share" />
              Share card
            </h3>
            <button className="chip" type="button" onClick={() => void onCopyLink()}>
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
          <img src={shareCardUrl} alt="Share card" />
          {shareCardUrl.startsWith("http") && (
            <p className="hint">This link opens the card for about an hour.</p>
          )}
          {linkToCopy && (
            <input
              readOnly
              value={linkToCopy}
              aria-label="Share card link"
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </figure>
      )}
    </article>
  );
}
