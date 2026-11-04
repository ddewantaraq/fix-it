import type { Phase } from "../types/session";

export function PhaseIcon({ id }: { id: Phase | "share" }) {
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
