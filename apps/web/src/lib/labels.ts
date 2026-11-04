export const OPTION_LABEL: Record<string, string> = {
  under_1h: "Under 1 hour",
  "1_to_2h": "1–2 hours",
  half_day: "Half a day",
};

export const OWNER_LABEL: Record<string, string> = {
  solo: "You",
  friends: "With friends",
  adult_help: "With an adult",
};

export const RECOMMENDATION_LABEL: Record<string, string> = {
  proceed_with_plan: "Proceed with this plan",
  stop_and_escalate: "Stop and get help",
};

export function optionLabel(value: string) {
  return OPTION_LABEL[value] ?? value.replaceAll("_", " ");
}

export function statusPillLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "done") return "Done";
  if (status === "escalated") return "Escalated";
  return status.replaceAll("_", " ");
}
