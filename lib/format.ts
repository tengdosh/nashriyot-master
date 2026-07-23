// Formatting helpers (spec v1 §4.2/§4.4). Pure & unit-tested.
// Money in UZS: "12 000 000 so'm". Dates: dd.mm.yyyy. Numbers: tabular, space-grouped.

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** Group thousands with spaces; rounds to a whole number. */
export function formatNumber(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return sign + Math.abs(rounded).toString().replace(GROUP, " ");
}

/** "12 000 000 so'm" */
export function formatUZS(value: number | string): string {
  return `${formatNumber(value)} so'm`;
}

/** dd.mm.yyyy */
export function formatDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Parse a user-entered money string ("12 000 000 so'm") back to a number. */
export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^\d-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
