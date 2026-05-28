export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Formats a US phone number for display as `+1(716)671-1980`.
 *
 * Accepts E.164 (`+17166711980`), bare 10-digit, or loosely formatted input.
 * Returns the input unchanged when it can't be parsed as a US number, and an
 * empty string for nullish input.
 */
export function formatUsPhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  const national =
    digits.length === 10
      ? digits
      : digits.length === 11 && digits.startsWith("1")
        ? digits.slice(1)
        : null;
  if (!national) return input;
  return `+1(${national.slice(0, 3)})${national.slice(3, 6)}-${national.slice(6)}`;
}
