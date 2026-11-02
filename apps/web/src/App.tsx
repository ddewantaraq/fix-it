import { useMemo, useState } from "react";
import type { AgentStepResponse } from "@iklim-pal/shared";
import {
  acceptAction,
  createSession,
  getSession,
  runStep,
  submitAnswer,
  uploadPhoto,
} from "./api";

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [city, setCity] = useState("Bandung");
  const [concern, setConcern] = useState(
    "Plastic bags and bottles along the riverbank near my neighborhood.",
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<AgentStepResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState("");

  const photoObjectUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  async function onStart() {
    setError(null);
    setBusy(true);
    try {
      if (!file) throw new Error("Choose a litter photo first");
      if (!city.trim() || !concern.trim()) throw new Error("City and concern required");
      const session = await createSession(city.trim(), concern.trim());
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

  async function onAcceptAction() {
    if (!sessionId || !step?.ui.proposedAction) return;
    setBusy(true);
    setError(null);
    try {
      const next = await acceptAction(sessionId, step.ui.proposedAction.id);
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
      <h1>Iklim PAL</h1>
      <p className="sub">
        Local climate action planner for youth — litter photo → safe, measurable plan
        (not a chatbot lecture)
      </p>

      <section className="panel">
        <h2>1. Capture</h2>
        <label>
          City / neighborhood
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label>
          Concern
          <textarea
            rows={3}
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
          />
        </label>
        <div className="row">
          <label className="file">
            Choose litter photo
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
          <button disabled={busy || !file} onClick={onStart}>
            Start
          </button>
        </div>
        {(previewUrl || photoObjectUrl) && (
          <img
            className="preview"
            src={previewUrl ?? photoObjectUrl ?? undefined}
            alt="Litter concern"
          />
        )}
      </section>

      {error && <p className="error">{error}</p>}
      {busy && <p>Working…</p>}

      {step && (
        <>
          <section className="panel">
            <h2>2. Guide</h2>
            <p>{step.assistantMessage}</p>
            <p>
              Status: <code>{step.status}</code>
              {step.escalated ? " · ESCALATED" : ""}
            </p>
            {step.ui.masks.length > 0 && (
              <div className="masks">
                <h3>SAM masks / evidence</h3>
                <ul>
                  {step.ui.masks.map((m) => (
                    <li key={m.partId + m.url}>
                      <code>{m.partId}</code> —{" "}
                      <a href={m.url} target="_blank" rel="noreferrer">
                        open
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step.ui.question && (
              <div className="block">
                <h3>Question</h3>
                <p>{step.ui.question.text}</p>
                {step.ui.question.options && (
                  <p className="hint">Options: {step.ui.question.options.join(", ")}</p>
                )}
                <div className="row">
                  <input
                    value={answerValue}
                    placeholder={
                      step.ui.question.expects === "yes_no" ? "yes / no" : "answer"
                    }
                    onChange={(e) => setAnswerValue(e.target.value)}
                  />
                  <button disabled={busy || !answerValue} onClick={onAnswer}>
                    Submit answer
                  </button>
                </div>
              </div>
            )}

            {step.ui.proposedAction && (
              <div className="block">
                <h3>Proposed action</h3>
                <p>
                  <strong>{step.ui.proposedAction.title}</strong> (
                  {step.ui.proposedAction.durationMinutes} min)
                </p>
                <ol>
                  {step.ui.proposedAction.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <button disabled={busy} onClick={onAcceptAction}>
                  Accept action
                </button>
              </div>
            )}

            {!step.ui.question && !step.ui.proposedAction && !step.ui.plan && (
              <button disabled={busy} onClick={onContinue}>
                Continue
              </button>
            )}
          </section>

          {step.ui.plan && (
            <section className="panel">
              <h2>3. Action Plan</h2>
              <p>
                <strong>{step.ui.plan.goal}</strong>
              </p>
              <p>
                Recommendation: <code>{step.ui.plan.recommendation}</code>
              </p>
              <ol>
                {step.ui.plan.steps.map((s) => (
                  <li key={s.order}>
                    <strong>{s.title}</strong> — {s.detail} ({s.owner}, {s.timeboxMinutes}
                    m)
                  </li>
                ))}
              </ol>
              <h3>Materials</h3>
              <ul>
                {step.ui.plan.materials.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <h3>Safety</h3>
              <ul>
                {step.ui.plan.safetyNotes.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <h3>Measure</h3>
              <ul>
                {step.ui.plan.measureHow.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <h3>Uncertainty</h3>
              <ul>
                {step.ui.plan.uncertainty.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              {step.ui.shareCardUrl && (
                <div>
                  <h3>Share card</h3>
                  <img className="preview" src={step.ui.shareCardUrl} alt="Share card" />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
