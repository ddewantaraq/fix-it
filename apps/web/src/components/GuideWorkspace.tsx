import type { AgentStepResponse } from "@iklim-pal/shared";
import type { RefObject } from "react";
import type { ChatMessage, Phase } from "../types/session";
import { LiveTurn } from "./LiveTurn";
import { PhaseIcon } from "./PhaseIcon";
import { PlanSheet } from "./PlanSheet";
import { Progress } from "./Progress";

export function GuideWorkspace({
  phase,
  error,
  busy,
  busyLabel,
  photoSrc,
  city,
  placeHint,
  concern,
  transcript,
  step,
  messages,
  answerValue,
  logRef,
  planRef,
  onNewConcern,
  onAnswerValue,
  onAnswer,
  onAcceptAction,
  onContinue,
  onConcernVoice,
  onMicError,
}: {
  phase: Phase;
  error: string | null;
  busy: boolean;
  busyLabel: string;
  photoSrc: string | null;
  city: string;
  placeHint: string;
  concern: string;
  transcript: string | null;
  step: AgentStepResponse;
  messages: ChatMessage[];
  answerValue: string;
  logRef: RefObject<HTMLDivElement | null>;
  planRef: RefObject<HTMLDivElement | null>;
  onNewConcern: () => void;
  onAnswerValue: (value: string) => void;
  onAnswer: (value: string | boolean, label: string) => void;
  onAcceptAction: () => void;
  onContinue: () => void;
  onConcernVoice: (file: File | null) => void;
  onMicError: (message: string) => void;
}) {
  return (
    <main className="workspace">
      <div className="workspace-head">
        <Progress phase={phase} />
        <button className="chip" type="button" onClick={onNewConcern}>
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
          {photoSrc && <img src={photoSrc} alt="Litter concern" />}
          <h2>{city.trim() || placeHint.trim() || "Your neighborhood"}</h2>
          <dl>
            <dt>Concern</dt>
            <dd>{concern.trim() || "Confirming from your photo…"}</dd>
          </dl>
          {transcript && (
            <p className="hint">
              Voice transcript: <em>{transcript}</em>
            </p>
          )}
          {step.ui.masks.length > 0 && (
            <div className="masks">
              <p className="eyebrow">Evidence</p>
              <ul>
                {step.ui.masks.map((mask) => (
                  <li key={mask.partId + mask.url}>{mask.partId.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="stage">
          <section
            className={
              step.ui.plan ? "thread is-done" : step.escalated ? "thread is-alert" : "thread"
            }
            aria-busy={busy}
            aria-labelledby="guide-heading"
          >
            <header className="thread-label">
              <PhaseIcon id="guide" />
              <div>
                <p className="eyebrow">Step 2</p>
                <h2 id="guide-heading">Guide</h2>
              </div>
            </header>
            <div className="log" ref={logRef} aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={`bubble ${message.role}`}>
                  {message.role === "assistant" && <span className="who">PAL</span>}
                  {message.imageUrl && <img src={message.imageUrl} alt="" />}
                  <p>{message.text}</p>
                </div>
              ))}
              <LiveTurn
                step={step}
                busy={busy}
                busyLabel={busyLabel}
                answerValue={answerValue}
                onAnswerValue={onAnswerValue}
                onAnswer={onAnswer}
                onAcceptAction={onAcceptAction}
                onContinue={onContinue}
                onConcernVoice={onConcernVoice}
                onMicError={onMicError}
              />
            </div>
          </section>
          {step.ui.plan && (
            <div ref={planRef}>
              <PlanSheet
                plan={step.ui.plan}
                shareCardUrl={step.ui.shareCardUrl}
                escalated={step.escalated}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
