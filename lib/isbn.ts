// ISBN-13 checksum (spec v1 §5.1 — live ISBN-13 validation).

/** Compute the ISBN-13 check digit for the first 12 digits. */
export function isbn13CheckDigit(first12: string): number {
  const digits = first12.replace(/[^0-9]/g, "").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i] || 0) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** True if `input` is a valid 13-digit ISBN-13 (dashes/spaces ignored). */
export function isValidIsbn13(input: string): boolean {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length !== 13) return false;
  return isbn13CheckDigit(digits.slice(0, 12)) === Number(digits[12]);
}

/** Pretty 978-9943-01-234-5 grouping (best-effort, falls back to raw digits). */
export function formatIsbn13(input: string): string {
  const d = input.replace(/[^0-9]/g, "").slice(0, 13);
  if (d.length !== 13) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 9)}-${d.slice(9, 12)}-${d.slice(12)}`;
}
