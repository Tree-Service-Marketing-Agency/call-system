export function isValidAreaCode(value: string): boolean {
  return /^[0-9]{3}$/.test(value);
}
