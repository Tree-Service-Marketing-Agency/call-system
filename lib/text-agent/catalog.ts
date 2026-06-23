import type { CatalogField } from "@/lib/db/schema";

// Validation for the Catalog (the fields the Text agent must capture). Mirrors
// the `{ ok, value } | { ok, error }` Result pattern used by
// validateNotificationPhones — pure, no DB. Writes reject invalid input.

export const CATALOG_FIELD_NAME_MAX = 80;
export const CATALOG_FIELD_DESC_MAX = 300;
export const CATALOG_MAX_FIELDS = 30;

export type ValidateCatalogResult =
  | { ok: true; value: CatalogField[] }
  | { ok: false; error: string };

export function validateCatalog(raw: unknown): ValidateCatalogResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "catalog must be an array" };
  }
  if (raw.length > CATALOG_MAX_FIELDS) {
    return {
      ok: false,
      error: `catalog cannot exceed ${CATALOG_MAX_FIELDS} fields`,
    };
  }

  const value: CatalogField[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "each catalog field must be an object" };
    }
    const e = entry as { name?: unknown; description?: unknown };

    if (typeof e.name !== "string" || e.name.trim().length === 0) {
      return { ok: false, error: "each catalog field needs a non-empty name" };
    }
    const name = e.name.trim();
    if (name.length > CATALOG_FIELD_NAME_MAX) {
      return {
        ok: false,
        error: `field name exceeds ${CATALOG_FIELD_NAME_MAX} characters`,
      };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `duplicate catalog field: ${name}` };
    }
    seen.add(key);

    const description =
      typeof e.description === "string" ? e.description.trim() : "";
    if (description.length > CATALOG_FIELD_DESC_MAX) {
      return {
        ok: false,
        error: `field description exceeds ${CATALOG_FIELD_DESC_MAX} characters`,
      };
    }

    value.push({ name, description });
  }

  return { ok: true, value };
}
