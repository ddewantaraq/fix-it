import { useConcernMic } from "../hooks/useConcernMic";

export function ConcernMicRecorder({
  busy,
  onRecorded,
  onError,
}: {
  busy: boolean;
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
}) {
  const mic = useConcernMic({ busy, onRecorded, onError });

  return (
    <div className="file-row">
      <span>{mic.recording ? "Recording… tap Stop when done" : "Or speak your concern"}</span>
      {mic.recording ? (
        <button
          className="chip is-recording"
          type="button"
          disabled={busy}
          onClick={mic.stopRecording}
        >
          Stop
        </button>
      ) : (
        <button
          className="chip"
          type="button"
          disabled={busy}
          onClick={() => void mic.startRecording()}
        >
          Record
        </button>
      )}
    </div>
  );
}
