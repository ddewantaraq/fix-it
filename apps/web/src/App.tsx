import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionPlan, AgentStepResponse } from "@iklim-pal/shared";
import {
  acceptAction,
  createSession,
  getSession,
  runStep,
  submitAnswer,
  uploadPhoto,
  uploadVoice,
} from "./api";

type Phase = "capture" | "guide" | "plan";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
};

const OPTION_LABEL: Record<string, string> = {
  under_1h: "Under 1 hour",
  "1_to_2h": "1–2 hours",
  half_day: "Half a day",
};

const OWNER_LABEL: Record<string, string> = {
  solo: "You",
  friends: "With friends",
  adult_help: "With an adult",
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  proceed_with_plan: "Proceed with this plan",
  stop_and_escalate: "Stop and get help",
};

function optionLabel(value: string) {
  return OPTION_LABEL[value] ?? value.replaceAll("_", " ");
}

function phaseOf(step: AgentStepResponse | null): Phase {
  if (!step) return "capture";
  if (step.ui.plan || step.status === "done" || step.status === "summarizing") return "plan";
  if (step.escalated && !step.ui.question && !step.ui.proposedAction) return "plan";
  return "guide";
}

function distinctMessage(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const question = step.ui.question?.text.trim();
  const title = step.ui.proposedAction?.title.trim();
  if (!message) return "";
  if (question && message === question) return "";
  if (title && message === title) return "";
  return message;
}

function answeredPrompt(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const question = step.ui.question?.text.trim() ?? "";
  if (message && question && message !== question) return `${message}\n\n${question}`;
  return question || message;
}

function actionPrompt(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const title = step.ui.proposedAction?.title ?? "";
  if (message && title && !message.includes(title)) return `${message}\n\n${title}`;
  return message || title;
}

function Progress({ phase }: { phase: Phase }) {
  const items: { id: Phase; label: string }[] = [
    { id: "capture", label: "Capture" },
    { id: "guide", label: "Guide" },
    { id: "plan", label: "Plan" },
  ];
  const active = items.findIndex((item) => item.id === phase);
  return (
    <ol className="progress" aria-label="Progress">
      {items.map((item, index) => (
        <li
          key={item.id}
          className={index === active ? "is-current" : index < active ? "is-done" : undefined}
        >
          <span>{index < active ? "✓" : index + 1}</span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [city, setCity] = useState("Bandung");
  const [concern, setConcern] = useState(
    "Plastic bags and bottles along the riverbank near my neighborhood.",
  );
  const [file, setFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<AgentStepResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Working…");
  const [error, setError] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const seq = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);

  const photoObjectUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    if (step?.ui.plan) {
      planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step, busy]);

  useEffect(() => {
    if (step?.ui.question?.id === "q_city") setAnswerValue(city.trim());
    else setAnswerValue("");
  }, [step?.ui.question?.id, city]);

  function nextId() {
    seq.current += 1;
    return `m-${seq.current}`;
  }

  function onPhoto(next: File | null) {
    setFile(next);
    setStep(null);
    setSessionId(null);
    setTranscript(null);
    setMessages([]);
    setPreviewUrl(null);
    setError(null);
  }

  function onNewConcern() {
    setSessionId(null);
    setStep(null);
    setMessages([]);
    setPreviewUrl(null);
    setTranscript(null);
    setError(null);
    setAnswerValue("");
    setBusy(false);
  }

  async function skipKnownCity(currentSessionId: string, next: AgentStepResponse) {
    if (next.ui.question?.id !== "q_city" || !city.trim()) return { step: next, note: "" };
    const place = city.trim();
    const followed = await submitAnswer(currentSessionId, "q_city", place);
    if (followed.ui.question?.id === "q_city") return { step: followed, note: "" };
    return {
      step: followed,
      note: `I'll use ${place} as the neighborhood. You already entered that, so we can skip ahead.`,
    };
  }

  async function onStart() {
    setError(null);
    setBusy(true);
    setBusyLabel("Starting your plan…");
    try {
      if (!file) throw new Error("Choose a litter photo first");
      if (!city.trim()) throw new Error("City required");
      if (!concern.trim() && !voiceFile) throw new Error("Concern text or voice clip required");
      const session = await createSession(city.trim(), concern.trim() || "(from voice)");
      setSessionId(session.id);
      setBusyLabel("Uploading the photo…");
      await uploadPhoto(session.id, file);
      let concernShown = concern.trim();
      if (voiceFile) {
        setBusyLabel("Transcribing your voice note…");
        const voice = await uploadVoice(session.id, voiceFile);
        setTranscript(voice.transcript);
        if (voice.transcript) {
          setConcern(voice.transcript);
          concernShown = voice.transcript;
        }
      }
      if (!concernShown) concernShown = "(from voice)";
      setBusyLabel("Looking at the photo…");
      const detail = await getSession(session.id);
      const imageUrl = detail.session.photoUrl ?? photoObjectUrl ?? undefined;
      setPreviewUrl(detail.session.photoUrl ?? photoObjectUrl);
      const first = await runStep(session.id);
      const settled = await skipKnownCity(session.id, first);
      const seeded: ChatMessage[] = [
        {
          id: nextId(),
          role: "user",
          text: `${city.trim()}\n\n${concernShown}`,
          imageUrl,
        },
      ];
      if (settled.note) {
        seeded.push({ id: nextId(), role: "assistant", text: settled.note });
      }
      setMessages(seeded);
      setStep(settled.step);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAnswer(value: string | boolean, label: string) {
    if (!sessionId || !step?.ui.question) return;
    setBusy(true);
    setError(null);
    setBusyLabel("Sending your answer…");
    try {
      const question = step.ui.question;
      let sent: string | boolean = value;
      if (question.expects === "yes_no" && typeof value === "string") {
        sent = value.toLowerCase().startsWith("y");
      }
      const prompt = answeredPrompt(step);
      const settled = await skipKnownCity(
        sessionId,
        await submitAnswer(sessionId, question.id, sent),
      );
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: prompt },
        { id: nextId(), role: "user", text: label },
        ...(settled.note
          ? [{ id: nextId(), role: "assistant" as const, text: settled.note }]
          : []),
      ]);
      setStep(settled.step);
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
    setBusyLabel("Saving that action…");
    try {
      const title = step.ui.proposedAction.title;
      const prompt = actionPrompt(step);
      const settled = await skipKnownCity(
        sessionId,
        await acceptAction(sessionId, step.ui.proposedAction.id),
      );
      setMessages((prev) => [
        ...prev,
        ...(prompt ? [{ id: nextId(), role: "assistant" as const, text: prompt }] : []),
        { id: nextId(), role: "user", text: `Accepted · ${title}` },
        ...(settled.note
          ? [{ id: nextId(), role: "assistant" as const, text: settled.note }]
          : []),
      ]);
      setStep(settled.step);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    if (!sessionId || !step) return;
    setBusy(true);
    setError(null);
    setBusyLabel("Continuing…");
    try {
      const prior = step.assistantMessage.trim();
      const settled = await skipKnownCity(sessionId, await runStep(sessionId));
      setMessages((prev) => [
        ...prev,
        ...(prior ? [{ id: nextId(), role: "assistant" as const, text: prior }] : []),
        ...(settled.note
          ? [{ id: nextId(), role: "assistant" as const, text: settled.note }]
          : []),
      ]);
      setStep(settled.step);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const photoSrc = previewUrl ?? photoObjectUrl;
  const phase = phaseOf(step);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          Iklim PAL
        </div>
        <p>Local action planner</p>
      </header>

      {!step ? (
        <main className="hero">
          <div>
            <p className="eyebrow">For young people, near home</p>
            <h1>A litter photo, turned into a plan you can do.</h1>
            <p className="lede">
              Share the place, what you noticed, and a photo. Iklim PAL asks a few practical
              questions, then gives you a safe, measurable next step.
            </p>
            <ul className="points">
              <li>
                <span>1</span>
                <div>Capture the neighborhood and a real photo of the litter.</div>
              </li>
              <li>
                <span>2</span>
                <div>Answer only what the guide still needs. Your city is not asked twice.</div>
              </li>
              <li>
                <span>3</span>
                <div>Leave with steps, materials, safety notes, and a way to measure.</div>
              </li>
            </ul>
          </div>

          <form
            className="card"
            onSubmit={(event) => {
              event.preventDefault();
              void onStart();
            }}
          >
            <Progress phase="capture" />
            <h2>Capture</h2>
            {error && (
              <p className="banner" role="alert">
                {error}
              </p>
            )}
            <label className={dragOver ? "drop is-over" : "drop"}>
              {photoObjectUrl ? (
                <img src={photoObjectUrl} alt="Selected litter photo" />
              ) : (
                <span className="drop-copy">
                  <strong>Choose a litter photo</strong>
                  Drop it here, or click to browse
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label="Choose litter photo"
                onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
                onDragEnter={() => setDragOver(true)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  const dropped = event.dataTransfer.files?.[0] ?? null;
                  if (dropped && dropped.type.startsWith("image/")) onPhoto(dropped);
                }}
              />
            </label>
            <label>
              City / neighborhood
              <input value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
            <label>
              Concern
              <textarea
                rows={3}
                value={concern}
                onChange={(event) => setConcern(event.target.value)}
              />
            </label>
            <div className="file-row">
              <span>{voiceFile ? voiceFile.name : "Voice note, optional"}</span>
              <label>
                Add voice
                <input
                  type="file"
                  accept="audio/*"
                  aria-label="Optional voice concern"
                  onChange={(event) => setVoiceFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {transcript && (
              <p className="hint">
                Voice transcript: <em>{transcript}</em>
              </p>
            )}
            <button className="primary" type="submit" disabled={busy || !file}>
              {busy ? busyLabel : "Start"}
            </button>
          </form>
        </main>
      ) : (
        <main className="workspace">
          <div className="workspace-head">
            <Progress phase={phase} />
            <button className="text-btn" type="button" onClick={onNewConcern}>
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
              <h2>{city.trim() || "Your neighborhood"}</h2>
              <dl>
                <dt>Concern</dt>
                <dd>{concern}</dd>
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
              >
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
                    onAnswerValue={setAnswerValue}
                    onAnswer={onAnswer}
                    onAcceptAction={onAcceptAction}
                    onContinue={onContinue}
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
      )}
    </>
  );
}

function LiveTurn({
  step,
  busy,
  busyLabel,
  answerValue,
  onAnswerValue,
  onAnswer,
  onAcceptAction,
  onContinue,
}: {
  step: AgentStepResponse;
  busy: boolean;
  busyLabel: string;
  answerValue: string;
  onAnswerValue: (value: string) => void;
  onAnswer: (value: string | boolean, label: string) => void;
  onAcceptAction: () => void;
  onContinue: () => void;
}) {
  const question = step.ui.question;
  const action = step.ui.proposedAction;
  const plan = step.ui.plan;
  const intro = distinctMessage(step);

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
          <p>{question.text}</p>
          {question.expects === "yes_no" ? (
            <div className="chips" role="group" aria-label="Answer">
              <button className="chip" type="button" disabled={busy} onClick={() => onAnswer(true, "Yes")}>
                Yes
              </button>
              <button className="chip" type="button" disabled={busy} onClick={() => onAnswer(false, "No")}>
                No
              </button>
            </div>
          ) : question.expects === "enum" && question.options?.length ? (
            <div className="chips" role="group" aria-label="Answer">
              {question.options.map((option) => (
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
          ) : (
            <form
              className="reply"
              onSubmit={(event) => {
                event.preventDefault();
                if (!answerValue.trim()) return;
                onAnswer(answerValue.trim(), answerValue.trim());
              }}
            >
              <input
                value={answerValue}
                placeholder="Short answer"
                aria-label="Answer"
                onChange={(event) => onAnswerValue(event.target.value)}
              />
              <button className="primary" type="submit" disabled={busy || !answerValue.trim()}>
                Send
              </button>
            </form>
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

function PlanSheet({
  plan,
  shareCardUrl,
  escalated,
}: {
  plan: ActionPlan;
  shareCardUrl?: string | null;
  escalated: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [linkToCopy, setLinkToCopy] = useState<string | null>(null);

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
      <p className="kicker">Your plan</p>
      <p className="rec">{RECOMMENDATION_LABEL[plan.recommendation] ?? plan.recommendation}</p>
      <h2>{plan.goal}</h2>
      <ol className="steps">
        {plan.steps.map((item) => (
          <li key={`${item.order}-${item.title}`}>
            <span className="step-index">{item.order}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <p className="meta">
                {OWNER_LABEL[item.owner] ?? item.owner} · {item.timeboxMinutes} min
              </p>
            </div>
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
            <h3>Share card</h3>
            <button className="text-btn" type="button" onClick={() => void onCopyLink()}>
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
