import { useMemo, useState } from "react";
import type { AgentStepResponse } from "@fix-it/shared";
import {
  createSession,
  getSession,
  runStep,
  submitAnswer,
  submitCheck,
  uploadPhoto,
} from "./api";

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<AgentStepResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState("");
  const [unpluggedAck, setUnpluggedAck] = useState(false);

  const photoObjectUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  async function onStart() {
    setError(null);
    setBusy(true);
    try {
      if (!file) throw new Error("Choose a fan photo first");
      const session = await createSession();
      setSessionId(session.id);
      await uploadPhoto(session.id, file);
      const detail = await getSession(session.id);
      setPreviewUrl(detail.session.photoUrl ?? photoObjectUrl);
      const next = await runStep(session.id);
      setStep(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAnswer() {
    if (!sessionId || !step?.ui.question) return;
    setBusy(true);
    setError(null);
    try {
      const q = step.ui.question;
      let value: string | boolean = answerValue;
      if (q.expects === "yes_no") {
        value = answerValue.toLowerCase().startsWith("y");
      }
      const next = await submitAnswer(sessionId, q.id, value);
      setStep(next);
      setAnswerValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCheck(outcome: "pass" | "fail" | "unclear") {
    if (!sessionId || !step?.ui.safeCheck) return;
    setBusy(true);
    setError(null);
    try {
      const next = await submitCheck(
        sessionId,
        step.ui.safeCheck.id,
        outcome,
        unpluggedAck,
      );
      setStep(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await runStep(sessionId);
      setStep(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>FixIt Vision</h1>
      <p className="sub">
        Household fan · won’t turn on · guided safe checks (not a diagnosis)
      </p>

      <section className="panel">
        <h2>1. Capture</h2>
        <div className="row">
          <label className="file">
            Choose photo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setStep(null);
                setSessionId(null);
              }}
            />
          </label>
          <button type="button" disabled={busy || !file} onClick={onStart}>
            Start session + first step
          </button>
        </div>
        {(previewUrl || photoObjectUrl) && (
          <p>
            <img
              className="preview"
              src={previewUrl ?? photoObjectUrl ?? undefined}
              alt="Fan upload preview"
            />
          </p>
        )}
        {sessionId && <p>Session: {sessionId}</p>}
      </section>

      {error && (
        <section className="panel">
          <p className="err">{error}</p>
        </section>
      )}

      {step && (
        <section className={`panel ${step.escalated ? "escalate" : ""}`}>
          <h2>2. Agent step · {step.status}</h2>
          <p>{step.assistantMessage}</p>

          {step.ui.hypotheses.length > 0 && (
            <div>
              <strong>Possible causes (unconfirmed)</strong>
              {step.ui.hypotheses.map((h) => (
                <div className="hypo" key={h.label}>
                  {h.label} · confidence {h.confidence}
                </div>
              ))}
            </div>
          )}

          {step.ui.masks.length > 0 && (
            <div className="mask-list">
              <strong>SAM evidence artifacts</strong>
              {step.ui.masks.map((m) => (
                <div key={m.partId}>
                  Part <code>{m.partId}</code>:{" "}
                  <a href={m.url} target="_blank" rel="noreferrer">
                    mask JSON
                  </a>
                </div>
              ))}
              <button type="button" className="secondary" disabled={busy} onClick={onContinue}>
                Continue next step
              </button>
            </div>
          )}

          {step.ui.question && (
            <div>
              <h3>Question</h3>
              <p>{step.ui.question.text}</p>
              {step.ui.question.options?.length ? (
                <div className="row">
                  {step.ui.question.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAnswerValue(opt);
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="row">
                  <button type="button" disabled={busy} onClick={() => setAnswerValue("yes")}>
                    Yes
                  </button>
                  <button type="button" disabled={busy} onClick={() => setAnswerValue("no")}>
                    No
                  </button>
                </div>
              )}
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <input
                  value={answerValue}
                  onChange={(e) => setAnswerValue(e.target.value)}
                  placeholder="Selected / typed answer"
                />
                <button type="button" disabled={busy || !answerValue} onClick={onAnswer}>
                  Submit answer
                </button>
              </div>
            </div>
          )}

          {step.ui.safeCheck && (
            <div>
              <h3>{step.ui.safeCheck.title}</h3>
              <ul>
                {step.ui.safeCheck.instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <label className="row">
                <input
                  type="checkbox"
                  checked={unpluggedAck}
                  onChange={(e) => setUnpluggedAck(e.target.checked)}
                />
                I confirm the fan is unplugged
              </label>
              <div className="row">
                <button type="button" disabled={busy} onClick={() => onCheck("pass")}>
                  Check done / pass
                </button>
                <button type="button" disabled={busy} onClick={() => onCheck("fail")}>
                  Issue found
                </button>
                <button type="button" disabled={busy} onClick={() => onCheck("unclear")}>
                  Unclear
                </button>
              </div>
            </div>
          )}

          {step.ui.brief && (
            <div>
              <h3>Repair brief</h3>
              <p>
                Recommendation: <strong>{step.ui.brief.recommendation}</strong>
              </p>
              <p>{step.ui.brief.technicianNotes}</p>
              <p>
                Uncertainty: {step.ui.brief.uncertainty.join(", ") || "(none listed)"}
              </p>
              <pre>{JSON.stringify(step.ui.brief, null, 2)}</pre>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
