// Excludes visually ambiguous characters: I, l, 1, O, 0.
const CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generatePassword(length = 12): string {
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARS.charAt(buf[i] % CHARS.length);
  }
  return out;
}
