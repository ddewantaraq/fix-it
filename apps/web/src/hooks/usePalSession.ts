import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentStepResponse } from "@iklim-pal/shared";
import {
  acceptAction,
  createSession,
  getSession,
  runStep,
  submitAnswer,
  uploadPhoto,
  uploadVoice,
} from "../api";
import { normalizeChipAnswer } from "../lib/answers";
import { placeLabelFromGeo } from "../lib/geo";
import { actionPrompt, answeredPrompt, phaseOf } from "../lib/phase";
import type { ChatMessage } from "../types/session";

export function usePalSession(ownerKey: string) {
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
  const seq = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);

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

  function resetCapture() {
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

  return {
    sessionId,
    city,
    setCity,
    concern,
    setConcern,
    placeHint,
    geoBusy,
    file,
    previewUrl,
    setPreviewUrl,
    step,
    messages,
    busy,
    setBusy,
    busyLabel,
    setBusyLabel,
    error,
    setError,
    answerValue,
    setAnswerValue,
    transcript,
    dragOver,
    setDragOver,
    logRef,
    planRef,
    photoObjectUrl,
    photoSrc: previewUrl ?? photoObjectUrl,
    phase: phaseOf(step),
    onPhoto,
    resetCapture,
    onUseLocation,
    onStart,
    onAnswer,
    onConcernVoice,
    onAcceptAction,
    onContinue,
  };
}
