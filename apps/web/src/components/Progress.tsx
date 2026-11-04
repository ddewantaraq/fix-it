import type { Phase } from "../types/session";
import { PhaseIcon } from "./PhaseIcon";

export function Progress({ phase }: { phase: Phase }) {
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
