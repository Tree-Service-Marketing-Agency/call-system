import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { rotateEmbedKey } from "@/lib/text-agent/repository";

async function companyExists(id: string): Promise<boolean> {
  const row = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    columns: { id: true },
  });
  return !!row;
}

// POST — mint a fresh embed_key for the company's Text agent. Agency-only
// security lever (ADR-014): rotating invalidates all existing embeds.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await companyExists(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await rotateEmbedKey(id);
  return NextResponse.json({ embedKey: updated.embedKey });
}
