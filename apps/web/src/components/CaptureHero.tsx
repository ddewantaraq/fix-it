import { PhaseIcon } from "./PhaseIcon";
import { Progress } from "./Progress";

export function CaptureHero({
  error,
  busy,
  busyLabel,
  geoBusy,
  placeHint,
  photoObjectUrl,
  dragOver,
  file,
  onDragOverChange,
  onPhoto,
  onUseLocation,
  onStart,
}: {
  error: string | null;
  busy: boolean;
  busyLabel: string;
  geoBusy: boolean;
  placeHint: string;
  photoObjectUrl: string | null;
  dragOver: boolean;
  file: File | null;
  onDragOverChange: (v: boolean) => void;
  onPhoto: (file: File | null) => void;
  onUseLocation: () => void;
  onStart: () => void;
}) {
  return (
    <main className="hero">
      <div>
        <p className="eyebrow">For young people, near home</p>
        <h1>A litter photo, turned into a plan you can do.</h1>
        <p className="lede">
          Start with a photo. Iklim PAL reads the litter, confirms the concern with you, asks a few
          practical questions, then gives a safe measurable next step.
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
          onStart();
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
            onDragEnter={() => onDragOverChange(true)}
            onDragOver={(event) => {
              event.preventDefault();
              onDragOverChange(true);
            }}
            onDragLeave={() => onDragOverChange(false)}
            onDrop={(event) => {
              event.preventDefault();
              onDragOverChange(false);
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
            onClick={onUseLocation}
          >
            {geoBusy ? "Finding place…" : placeHint ? "Update location" : "Use my location"}
          </button>
        </div>
        <button className="primary" type="submit" disabled={busy || !file}>
          {busy ? busyLabel : "Start"}
        </button>
      </form>
    </main>
  );
}
