import { useEffect, useState } from "react";
import type { AgentStepResponse } from "@iklim-pal/shared";
import { normalizeChipAnswer } from "../lib/answers";
import { ENABLE_FREE_TEXT_ANSWER_MODE } from "../lib/flags";
import { optionLabel } from "../lib/labels";
import { distinctMessage, liveQuestionPrompt } from "../lib/phase";
import { ConcernMicRecorder } from "./ConcernMicRecorder";

export function LiveTurn({
  step,
  busy,
  busyLabel,
  answerValue,
  onAnswerValue,
  onAnswer,
  onAcceptAction,
  onContinue,
  onConcernVoice,
  onMicError,
}: {
  step: AgentStepResponse;
  busy: boolean;
  busyLabel: string;
  answerValue: string;
  onAnswerValue: (value: string) => void;
  onAnswer: (value: string | boolean, label: string) => void;
  onAcceptAction: () => void;
  onContinue: () => void;
  onConcernVoice: (file: File | null) => void;
  onMicError: (message: string) => void;
}) {
  const question = step.ui.question;
  const action = step.ui.proposedAction;
  const plan = step.ui.plan;
  const intro = !question ? distinctMessage(step) : "";
  const questionPrompt = question ? liveQuestionPrompt(step) : "";
  const showConcernVoice = question?.id === "q_concern";
  const isYesNo = question?.expects === "yes_no";
  const isEnum = question?.expects === "enum" && Boolean(question.options?.length);
  const chipMode = isYesNo || isEnum;
  const enumAllowsFreeText = isEnum;
  const [freeTextMode, setFreeTextMode] = useState(false);

  useEffect(() => {
    setFreeTextMode(false);
  }, [question?.id]);

  const replyForm = (
    <form
      className="reply"
      onSubmit={(event) => {
        event.preventDefault();
        if (!answerValue.trim()) return;
        const normalized = normalizeChipAnswer(
          question?.expects,
          question?.options,
          answerValue.trim(),
        );
        const label =
          typeof normalized === "boolean"
            ? normalized
              ? "Yes"
              : "No"
            : optionLabel(String(normalized));
        onAnswer(normalized, label);
      }}
    >
      <input
        value={answerValue}
        placeholder={
          isYesNo
            ? "Yes or no…"
            : isEnum
              ? "Or type your own (e.g. 45 minutes)…"
              : "Short answer"
        }
        aria-label="Answer"
        disabled={busy}
        onChange={(event) => onAnswerValue(event.target.value)}
      />
      <button className="primary" type="submit" disabled={busy || !answerValue.trim()}>
        Send
      </button>
    </form>
  );

  return (
    <>
      {intro && (
        <div className={step.escalated ? "bubble assistant alert" : "bubble assistant"}>
          <span className="who">PAL</span>
          <p>{intro}</p>
        </div>
      )}

      {question && (
        <div className={step.escalated ? "bubble assistant alert" : "bubble assistant"}>
          <span className="who">PAL</span>
          <p>{questionPrompt}</p>
          {chipMode && !(ENABLE_FREE_TEXT_ANSWER_MODE && freeTextMode) ? (
            <>
              {isYesNo ? (
                <div className="chips" role="group" aria-label="Answer">
                  <button
                    className="chip"
                    type="button"
                    disabled={busy}
                    onClick={() => onAnswer(true, "Yes")}
                  >
                    Yes
                  </button>
                  <button
                    className="chip"
                    type="button"
                    disabled={busy}
                    onClick={() => onAnswer(false, "No")}
                  >
                    No
                  </button>
                </div>
              ) : (
                <div className="chips" role="group" aria-label="Answer">
                  {(question.options ?? []).map((option) => (
                    <button
                      key={option}
                      className="chip"
                      type="button"
                      disabled={busy}
                      onClick={() => onAnswer(option, optionLabel(option))}
                    >
                      {optionLabel(option)}
                    </button>
                  ))}
                </div>
              )}
              {enumAllowsFreeText && (
                <>
                  <p className="hint answer-or">Or type a different amount</p>
                  {replyForm}
                </>
              )}
              {ENABLE_FREE_TEXT_ANSWER_MODE && isYesNo && (
                <button
                  className="text-btn answer-mode-toggle"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onAnswerValue("");
                    setFreeTextMode(true);
                  }}
                >
                  Type instead
                </button>
              )}
            </>
          ) : (
            <>
              {showConcernVoice && (
                <ConcernMicRecorder
                  busy={busy}
                  onRecorded={(file) => onConcernVoice(file)}
                  onError={onMicError}
                />
              )}
              {replyForm}
              {ENABLE_FREE_TEXT_ANSWER_MODE && isYesNo && freeTextMode && (
                <button
                  className="text-btn answer-mode-toggle"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onAnswerValue("");
                    setFreeTextMode(false);
                  }}
                >
                  Use buttons
                </button>
              )}
            </>
          )}
        </div>
      )}

      {action && (
        <div className="action-card">
          <p className="meta">{action.durationMinutes} min</p>
          <h3>{action.title}</h3>
          <ol>
            {action.steps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          {action.materials.length > 0 && (
            <p className="meta">Materials: {action.materials.join(", ")}</p>
          )}
          <button className="primary" type="button" disabled={busy} onClick={onAcceptAction}>
            Accept action
          </button>
        </div>
      )}

      {!question && !action && !plan && (
        <button className="primary" type="button" disabled={busy} onClick={onContinue}>
          Continue
        </button>
      )}

      {busy && (
        <div className="bubble assistant">
          <span className="who">PAL</span>
          <p className="typing" aria-live="polite">
            <i />
            <i />
            <i />
            {busyLabel}
          </p>
        </div>
      )}
    </>
  );
}
