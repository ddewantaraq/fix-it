import { optionLabel } from "./labels";

/** Map free-text replies onto pack yes_no / enum values when possible. */
export function normalizeChipAnswer(
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
