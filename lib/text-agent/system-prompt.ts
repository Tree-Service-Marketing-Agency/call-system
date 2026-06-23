import type { CatalogField } from "@/lib/db/schema";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/models";

// Mechanic that sits ABOVE the editable prompt and the admin cannot break:
// the current date/time (the model doesn't know "today"), the Catalog the
// agent must capture, and the "don't invent data" rule. An edit from the panel
// shapes the voice, not the mechanic.

export const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE || "America/Los_Angeles";

export function formatBusinessNow(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
}

export function buildSystemPrompt(opts: {
  activePrompt: string;
  catalog: CatalogField[];
  now?: Date;
  timeZone?: string;
}): string {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? BUSINESS_TIMEZONE;
  const prompt = opts.activePrompt.trim() || DEFAULT_SYSTEM_PROMPT;

  const lines: string[] = [
    `Fecha y hora actual del negocio: ${formatBusinessNow(now, timeZone)} (${timeZone}).`,
    `No inventes datos: si no sabes algo, dilo con claridad en lugar de adivinar.`,
  ];

  if (opts.catalog.length > 0) {
    lines.push(
      ``,
      `Durante la conversación debes captar de forma natural estos datos del visitante. No los pidas como un formulario: hazlo cuando tenga sentido en el diálogo.`,
      ...opts.catalog.map(
        (f) => `- ${f.name}${f.description ? `: ${f.description}` : ""}`
      )
    );
  }

  // The admin's editable prompt sits at the bottom, intact.
  lines.push(``, prompt);
  return lines.join("\n");
}
