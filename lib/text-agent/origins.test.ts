import { describe, it, expect } from "vitest";
import {
  MAX_ALLOWED_ORIGINS,
  normalizeOrigin,
  originAllowed,
  validateAllowedOrigins,
} from "@/lib/text-agent/origins";

describe("normalizeOrigin", () => {
  it("accepts a plain https origin", () => {
    expect(normalizeOrigin("https://example.com")).toBe("https://example.com");
  });

  it("accepts a plain http origin", () => {
    expect(normalizeOrigin("http://example.com")).toBe("http://example.com");
  });

  it("strips a trailing slash", () => {
    expect(normalizeOrigin("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  it("lowercases the host", () => {
    expect(normalizeOrigin("https://Example.COM")).toBe("https://example.com");
  });

  it("preserves an explicit port", () => {
    expect(normalizeOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects a value carrying a path beyond /", () => {
    expect(normalizeOrigin("https://example.com/widget")).toBeNull();
  });

  it("rejects a value carrying a query", () => {
    expect(normalizeOrigin("https://example.com/?a=1")).toBeNull();
  });

  it("rejects non-http(s) protocols", () => {
    expect(normalizeOrigin("ftp://example.com")).toBeNull();
    expect(normalizeOrigin("ws://example.com")).toBeNull();
  });

  it("rejects javascript: URLs", () => {
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("   ")).toBeNull();
  });

  it("rejects an origin longer than the cap", () => {
    const huge = "https://" + "a".repeat(300) + ".com";
    expect(normalizeOrigin(huge)).toBeNull();
  });
});

describe("validateAllowedOrigins", () => {
  it("accepts an empty array", () => {
    expect(validateAllowedOrigins([])).toEqual({ ok: true, value: [] });
  });

  it("normalizes and keeps order", () => {
    expect(
      validateAllowedOrigins(["https://Example.com/", "http://localhost:3000"]),
    ).toEqual({
      ok: true,
      value: ["https://example.com", "http://localhost:3000"],
    });
  });

  it("trims and drops empty entries", () => {
    expect(
      validateAllowedOrigins(["  https://example.com  ", "", "   "]),
    ).toEqual({ ok: true, value: ["https://example.com"] });
  });

  it("dedupes after normalization", () => {
    expect(
      validateAllowedOrigins([
        "https://example.com",
        "https://EXAMPLE.com/",
      ]),
    ).toEqual({ ok: true, value: ["https://example.com"] });
  });

  it("rejects a malformed entry", () => {
    const result = validateAllowedOrigins(["https://ok.com", "nope"]);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-string entry", () => {
    const result = validateAllowedOrigins(["https://ok.com", 42]);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-array", () => {
    expect(validateAllowedOrigins("https://example.com").ok).toBe(false);
    expect(validateAllowedOrigins(null).ok).toBe(false);
  });

  it("rejects more than the cap", () => {
    const many = Array.from(
      { length: MAX_ALLOWED_ORIGINS + 1 },
      (_, i) => `https://site${i}.com`,
    );
    const result = validateAllowedOrigins(many);
    expect(result.ok).toBe(false);
  });

  it("accepts exactly the cap", () => {
    const many = Array.from(
      { length: MAX_ALLOWED_ORIGINS },
      (_, i) => `https://site${i}.com`,
    );
    const result = validateAllowedOrigins(many);
    expect(result.ok).toBe(true);
  });
});

describe("originAllowed", () => {
  const allowed = ["https://example.com", "http://localhost:3000"];

  it("matches an exact origin", () => {
    expect(originAllowed("https://example.com", allowed)).toBe(true);
  });

  it("matches case-insensitively on host", () => {
    expect(originAllowed("https://EXAMPLE.com", allowed)).toBe(true);
  });

  it("matches including the port", () => {
    expect(originAllowed("http://localhost:3000", allowed)).toBe(true);
  });

  it("does not match a different port", () => {
    expect(originAllowed("http://localhost:4000", allowed)).toBe(false);
  });

  it("does not match a different scheme", () => {
    expect(originAllowed("http://example.com", allowed)).toBe(false);
  });

  it("returns false for a null origin", () => {
    expect(originAllowed(null, allowed)).toBe(false);
  });

  it("returns false for an empty origin", () => {
    expect(originAllowed("", allowed)).toBe(false);
  });

  it("returns false against an empty allowlist", () => {
    expect(originAllowed("https://example.com", [])).toBe(false);
  });
});
