import { useEffect, useRef, useState } from "react";
import { pickRecorderMime } from "../lib/mime";

export function useConcernMic(opts: {
  busy: boolean;
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
}) {
  const { busy, onRecorded, onError } = opts;
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

  return {
    busy,
    recording,
    startRecording,
    stopRecording,
  };
}
