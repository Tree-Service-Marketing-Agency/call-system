// Recording helpers. Pure and client-safe: do NOT import `db` or any
// server-only module here — this file is imported by client components.

// A Recording is no longer available 30 days after the Call was created.
// Mirrors the rule that lived in call-detail-sheet.tsx, accepting Date | string
// so it can run both server-side (page) and client-side (detail sheet).
export function isAudioExpired(createdAt: Date | string): boolean {
  const created = new Date(createdAt);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return created < thirtyDaysAgo;
}
