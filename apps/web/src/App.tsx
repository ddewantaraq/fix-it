import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionPlan, AgentStepResponse } from "@iklim-pal/shared";
import {
  acceptAction,
  createSession,
  getOwnerKey,
  getSession,
  listSessions,
  runStep,
  submitAnswer,
  updateProgress,
  uploadPhoto,
  uploadVoice,
} from "./api";
import type { SessionDetail, SessionSummary } from "@iklim-pal/shared";

type Phase = "capture" | "guide" | "plan";
type AppView = "home" | "plans" | "plan-detail";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
};

/** Flip via VITE_ENABLE_FREE_TEXT_ANSWERS=true to re-enable Type instead on chip questions. */
const ENABLE_FREE_TEXT_ANSWER_MODE =
  import.meta.env.VITE_ENABLE_FREE_TEXT_ANSWERS === "true";

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

/** Map free-text replies onto pack yes_no / enum values when possible. */
function normalizeChipAnswer(
  expects: string | undefined,
  options: string[] | undefined,
  value: string,
): string | boolean {
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (expects === "yes_no") {
    if (/^(y|yes|true|yeah|yep|ya|ok|okay)$/i.test(lower)) return true;
    if (/^(n|no|false|nope|nah)$/i.test(lower)) return false;
    if (lower.startsWith("y")) return true;
    if (lower.startsWith("n")) return false;
    return raw;
  }
  if (expects === "enum" && options?.length) {
    const byId = options.find((o) => o.toLowerCase() === lower);
    if (byId) return byId;
    const byLabel = options.find((o) => optionLabel(o).toLowerCase() === lower);
    if (byLabel) return byLabel;
    const partial = options.find(
      (o) =>
        lower.includes(o.toLowerCase()) ||
        optionLabel(o).toLowerCase().includes(lower) ||
        lower.includes(optionLabel(o).toLowerCase()),
    );
    if (partial) return partial;
  }
  return raw;
}

function phaseOf(step: AgentStepResponse | null): Phase {
  if (!step) return "capture";
  if (
    step.ui.plan ||
    step.status === "done" ||
    step.status === "active" ||
    step.status === "summarizing"
  ) {
    return "plan";
  }
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

/** Single line shown for a live question turn (Spark framing preferred). */
function liveQuestionPrompt(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const question = step.ui.question?.text.trim() ?? "";
  return message || question;
}

function answeredPrompt(step: AgentStepResponse) {
  return liveQuestionPrompt(step);
}

function actionPrompt(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const title = step.ui.proposedAction?.title ?? "";
  if (message && title && !message.includes(title)) return `${message}\n\n${title}`;
  return message || title;
}

function pickRecorderMime(): { mimeType: string; extension: string } {
  const candidates: { mimeType: string; extension: string }[] = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "", extension: "webm" };
}

/** Browser geolocation → place label only (coords never sent to our API). */
async function placeLabelFromGeo(): Promise<string> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12_000,
      maximumAge: 60_000,
    });
  });
  const { latitude, longitude } = pos.coords;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "14");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Could not look up that place name");
  const data = (await res.json()) as {
    address?: {
      suburb?: string;
      neighbourhood?: string;
      village?: string;
      town?: string;
      city?: string;
      municipality?: string;
      state?: string;
    };
    display_name?: string;
  };
  const a = data.address ?? {};
  const neighborhood =
    a.suburb || a.neighbourhood || a.village || a.town || a.municipality || "";
  const cityName = a.city || a.town || a.state || "";
  if (neighborhood && cityName && neighborhood !== cityName) {
    return `${cityName} — ${neighborhood}`;
  }
  if (cityName) return cityName;
  if (neighborhood) return neighborhood;
  if (data.display_name) return data.display_name.split(",").slice(0, 2).join(",").trim();
  throw new Error("Could not read a city name from that location");
}

function PhaseIcon({ id }: { id: Phase | "share" }) {
  const props = {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (id === "capture") {
    return (
      <svg {...props}>
        <path d="M4.5 8.5h3l1.4-2h6.2l1.4 2h3v10h-15v-10z" />
        <circle cx="12" cy="13.2" r="2.6" />
      </svg>
    );
  }
  if (id === "guide") {
    return (
      <svg {...props}>
        <path d="M5 6.5h14v8.5H9.2L5 18.2V6.5z" />
      </svg>
    );
  }
  if (id === "share") {
    return (
      <svg {...props}>
        <circle cx="6.5" cy="12" r="2" />
        <circle cx="17" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
        <path d="M8.4 11.1 14.8 8.1M8.4 12.9 14.8 15.9" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M9 7h10M9 12h10M9 17h10" />
      <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
    </svg>
  );
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
          <span className="progress-mark">
            <PhaseIcon id={item.id} />
            <span>{index < active ? "✓" : index + 1}</span>
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

export function App() {
  const [view, setView] = useState<AppView>("home");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [concern, setConcern] = useState("");
  const [placeHint, setPlaceHint] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<AgentStepResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Working…");
  const [error, setError] = useState<string | null>(null);
  const [answerValue, setAnswerValue] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [planSummaries, setPlanSummaries] = useState<SessionSummary[]>([]);
  const [planDetail, setPlanDetail] = useState<SessionDetail | null>(null);
  const [openingPlanId, setOpeningPlanId] = useState<string | null>(null);
  const seq = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const ownerKey = useMemo(() => getOwnerKey(), []);

  const photoObjectUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    if (!photoObjectUrl) return;
    return () => URL.revokeObjectURL(photoObjectUrl);
  }, [photoObjectUrl]);

  useEffect(() => {
    if (step?.ui.plan) {
      planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step, busy]);

  useEffect(() => {
    const qid = step?.ui.question?.id;
    if (qid === "q_city" && (city.trim() || placeHint.trim())) {
      setAnswerValue(city.trim() || placeHint.trim());
    } else {
      setAnswerValue("");
    }
  }, [step?.ui.question?.id, city, placeHint]);

  useEffect(() => {
    if (!sessionId || !step) return;
    let cancelled = false;
    void getSession(sessionId).then((detail) => {
      if (cancelled) return;
      if (detail.session.city) setCity(detail.session.city);
      if (detail.session.concernText) setConcern(detail.session.concernText);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, step?.status, step?.ui.question?.id, step?.ui.plan]);

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
    setConcern("");
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
    setConcern("");
    setCity("");
    setPlaceHint("");
    setFile(null);
    setPlanDetail(null);
    setView("home");
  }

  async function openPlans() {
    setError(null);
    setBusy(true);
    setBusyLabel("Loading plans…");
    try {
      const { sessions } = await listSessions(ownerKey);
      setPlanSummaries(sessions);
      setView("plans");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openPlanDetail(id: string) {
    setError(null);
    setOpeningPlanId(id);
    setBusyLabel("Opening plan…");
    try {
      const detail = await getSession(id);
      setPlanDetail(detail);
      setCity(detail.session.city);
      setConcern(detail.session.concernText);
      setPreviewUrl(detail.session.photoUrl ?? null);
      setView("plan-detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningPlanId(null);
    }
  }

  async function onToggleStep(order: number, checked: boolean) {
    if (!planDetail) return;
    const current = new Set(planDetail.progress?.completedStepOrders ?? []);
    if (checked) current.add(order);
    else current.delete(order);
    setBusy(true);
    setError(null);
    try {
      const detail = await updateProgress(planDetail.session.id, [...current]);
      setPlanDetail(detail);
      const { sessions } = await listSessions(ownerKey);
      setPlanSummaries(sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onUseLocation() {
    setError(null);
    setGeoBusy(true);
    try {
      const label = await placeLabelFromGeo();
      setPlaceHint(label);
      setCity(label);
    } catch (err) {
      setError(
        err instanceof GeolocationPositionError
          ? "Location permission denied or unavailable. You can still continue — we will ask in the guide."
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setGeoBusy(false);
    }
  }

  async function onStart() {
    setError(null);
    setBusy(true);
    setBusyLabel("Starting your plan…");
    try {
      if (!file) throw new Error("Choose a litter photo first");
      const hint = placeHint.trim() || city.trim();
      const session = await createSession({ city: hint, ownerKey });
      setSessionId(session.id);
      setView("home");
      setBusyLabel("Uploading the photo…");
      await uploadPhoto(session.id, file);
      setBusyLabel("Looking at the photo…");
      const detail = await getSession(session.id);
      const imageUrl = detail.session.photoUrl ?? photoObjectUrl ?? undefined;
      setPreviewUrl(detail.session.photoUrl ?? photoObjectUrl);
      const first = await runStep(session.id);
      setMessages([
        {
          id: nextId(),
          role: "user",
          text: hint ? `Photo from near ${hint}` : "Here is the litter photo.",
          imageUrl,
        },
      ]);
      setStep(first);
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
      if (typeof value === "string" && question.expects !== "short_text") {
        sent = normalizeChipAnswer(question.expects, question.options, value);
      }
      const prompt = answeredPrompt(step);
      const next = await submitAnswer(sessionId, question.id, sent);
      if (question.id === "q_city" && typeof sent === "string") setCity(sent);
      if (question.id === "q_concern" && typeof sent === "string") setConcern(sent);
      if (question.id === "q_concern_confirm" && sent === true) {
        const detail = await getSession(sessionId);
        if (detail.session.concernText) setConcern(detail.session.concernText);
      }
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: prompt },
        { id: nextId(), role: "user", text: label },
      ]);
      setStep(next);
      setAnswerValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onConcernVoice(fileNext: File | null) {
    if (!sessionId || !fileNext) return;
    setBusy(true);
    setBusyLabel("Transcribing your voice note…");
    setError(null);
    try {
      const voice = await uploadVoice(sessionId, fileNext);
      setTranscript(voice.transcript);
      if (voice.transcript) setAnswerValue(voice.transcript);
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
      const next = await acceptAction(sessionId, step.ui.proposedAction.id);
      setMessages((prev) => [
        ...prev,
        ...(prompt ? [{ id: nextId(), role: "assistant" as const, text: prompt }] : []),
        { id: nextId(), role: "user", text: `Accepted · ${title}` },
      ]);
      setStep(next);
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
      const next = await runStep(sessionId);
      setMessages((prev) => [
        ...prev,
        ...(prior ? [{ id: nextId(), role: "assistant" as const, text: prior }] : []),
      ]);
      setStep(next);
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
          <img
            className="brand-logo"
            src="/icons/01_logo_horizontal_transparent.png"
            alt="Iklim PAL"
            width={1256}
            height={449}
          />
        </div>
        <div className="topbar-actions">
          <p>Local action planner</p>
          <button className="chip" type="button" disabled={busy} onClick={() => void openPlans()}>
            Plans
          </button>
        </div>
      </header>

      {view === "plans" ? (
        <main className="workspace">
          <div className="workspace-head plans-workspace-head">
            <div>
              <p className="eyebrow">History</p>
              <h1 className="plans-title">Your plans</h1>
            </div>
            <div className="plans-head-actions">
              <button className="chip" type="button" disabled={busy} onClick={() => void openPlans()}>
                {busy ? "Refreshing…" : "Refresh"}
              </button>
              <button className="chip" type="button" onClick={() => setView("home")}>
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
          <PlansHome
            summaries={planSummaries}
            openingId={openingPlanId}
            onOpen={(id) => void openPlanDetail(id)}
          />
        </main>
      ) : view === "plan-detail" && planDetail ? (
        <main className="workspace">
          <div className="workspace-head plans-workspace-head">
            <button className="chip" type="button" onClick={() => void openPlans()}>
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
      ) : !step ? (
        <main className="hero">
          <div>
            <p className="eyebrow">For young people, near home</p>
            <h1>A litter photo, turned into a plan you can do.</h1>
            <p className="lede">
              Start with a photo. Iklim PAL reads the litter, confirms the concern with you, asks a
              few practical questions, then gives a safe measurable next step.
            </p>
            <ul className="points">
              <li>
                <span>
                  <PhaseIcon id="capture" />
                  <span className="point-num">1</span>
                </span>
                <div>
                  <p className="point-label">Capture</p>
                  Add a real litter photo. Optionally share your location for a place hint.
                </div>
              </li>
              <li>
                <span>
                  <PhaseIcon id="guide" />
                  <span className="point-num">2</span>
                </span>
                <div>
                  <p className="point-label">Guide</p>
                  Confirm what Muse sees, then answer only what the guide still needs.
                </div>
              </li>
              <li>
                <span>
                  <PhaseIcon id="plan" />
                  <span className="point-num">3</span>
                </span>
                <div>
                  <p className="point-label">Plan</p>
                  Leave with steps, materials, safety notes, and a way to measure.
                </div>
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
            <div className="phase-head">
              <p className="eyebrow">Step 1</p>
              <h2>
                <PhaseIcon id="capture" />
                Capture
              </h2>
            </div>
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
                  <span className="drop-icon">
                    <PhaseIcon id="capture" />
                  </span>
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
            <div className="file-row">
              <span>
                {placeHint
                  ? `Near ${placeHint}`
                  : "Location optional — we only keep a place name, never GPS"}
              </span>
              <button
                className="chip"
                type="button"
                disabled={geoBusy || busy}
                onClick={() => void onUseLocation()}
              >
                {geoBusy ? "Finding place…" : placeHint ? "Update location" : "Use my location"}
              </button>
            </div>
            <button className="primary" type="submit" disabled={busy || !file}>
              {busy ? busyLabel : "Start"}
            </button>
          </form>
        </main>
      ) : (
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
                    onAnswerValue={setAnswerValue}
                    onAnswer={onAnswer}
                    onAcceptAction={onAcceptAction}
                    onContinue={onContinue}
                    onConcernVoice={onConcernVoice}
                    onMicError={(message) => setError(message || null)}
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

function ConcernMicRecorder({
  busy,
  onRecorded,
  onError,
}: {
  busy: boolean;
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      releaseStream();
    };
  }, []);

  async function startRecording() {
    onError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Voice recording is not supported in this browser. Type your concern instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mimeType, extension } = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        releaseStream();
        mediaRecorderRef.current = null;
        setRecording(false);
        if (blob.size === 0) {
          onError("No audio captured. Try again or type your concern.");
          return;
        }
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : extension;
        onRecorded(new File([blob], `concern.${ext}`, { type }));
      };
      recorder.onerror = () => {
        releaseStream();
        mediaRecorderRef.current = null;
        setRecording(false);
        onError("Recording failed. Type your concern instead.");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      releaseStream();
      setRecording(false);
      onError("Microphone permission denied or unavailable. You can still type your concern.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      releaseStream();
      setRecording(false);
      return;
    }
    recorder.stop();
  }

  return (
    <div className="file-row">
      <span>{recording ? "Recording… tap Stop when done" : "Or speak your concern"}</span>
      {recording ? (
        <button
          className="chip is-recording"
          type="button"
          disabled={busy}
          onClick={stopRecording}
        >
          Stop
        </button>
      ) : (
        <button
          className="chip"
          type="button"
          disabled={busy}
          onClick={() => void startRecording()}
        >
          Record
        </button>
      )}
    </div>
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
  const isEnum =
    question?.expects === "enum" && Boolean(question.options?.length);
  const chipMode = isYesNo || isEnum;
  /** Enum answers (e.g. time budget) often fall outside chips — always offer free text. */
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

function statusPillLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "done") return "Done";
  if (status === "escalated") return "Escalated";
  return status.replaceAll("_", " ");
}

function PlansHome({
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
                  className={
                    item.status === "escalated" ? "plan-card is-alert" : "plan-card"
                  }
                >
                  <div className="plan-card-body">
                    <div className="plan-card-top">
                      <p className="kicker">{item.city || "Place TBD"}</p>
                      <span
                        className={
                          item.status === "escalated"
                            ? "status-pill is-alert"
                            : "status-pill"
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

function PlanSheet({
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
      {onToggleStep && (
        <p className="meta progress-line">Progress {pct}%</p>
      )}
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
