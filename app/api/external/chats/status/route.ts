import { NextResponse } from "next/server";
import { verifyExternalApiKey } from "@/lib/external-auth";
import { setChatStatus } from "@/lib/chat/pending";

const VALID_STATUSES = ["pending", "sent"] as const;

// PATCH /api/external/chats/status — n8n marks a Chat conversation `sent` once
// the Lead is delivered to the CRM. Idempotent; 404 if the id is unknown.
export async function PATCH(request: Request) {
  const unauthorized = verifyExternalApiKey(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    status?: unknown;
  };

  if (typeof body.id !== "string" || body.id.trim().length === 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (
    typeof body.status !== "string" ||
    !(VALID_STATUSES as readonly string[]).includes(body.status)
  ) {
    return NextResponse.json(
      { error: "status must be 'pending' or 'sent'" },
      { status: 400 }
    );
  }

  const result = await setChatStatus(
    body.id,
    body.status as (typeof VALID_STATUSES)[number]
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
