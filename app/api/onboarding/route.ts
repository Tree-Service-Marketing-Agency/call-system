import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { normalizeUsPhone } from "@/lib/phone";
import {
  EmailAlreadyExistsError,
  onboardCompany,
} from "@/lib/onboarding/create-company";

export async function POST(request: Request) {
  const auth = await requireRole("root", "admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    name,
    notificationPhones,
    leadSnapWebhook,
    userEmail,
    userPassword,
  } = body as {
    name?: unknown;
    notificationPhones?: unknown;
    leadSnapWebhook?: unknown;
    userEmail?: unknown;
    userPassword?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof userEmail !== "string" || userEmail.trim().length === 0) {
    return NextResponse.json(
      { error: "userEmail is required" },
      { status: 400 }
    );
  }
  if (typeof userPassword !== "string" || userPassword.length === 0) {
    return NextResponse.json(
      { error: "userPassword is required" },
      { status: 400 }
    );
  }
  if (
    !Array.isArray(notificationPhones) ||
    notificationPhones.length === 0 ||
    !notificationPhones.every((p) => typeof p === "string")
  ) {
    return NextResponse.json(
      { error: "notificationPhones must be a non-empty array of strings" },
      { status: 400 }
    );
  }

  const normalizedPhones: string[] = [];
  for (const raw of notificationPhones as string[]) {
    if (raw.trim().length === 0) continue;
    const normalized = normalizeUsPhone(raw);
    if (!normalized) {
      return NextResponse.json(
        { error: `Invalid US phone number: ${raw}` },
        { status: 400 }
      );
    }
    normalizedPhones.push(normalized);
  }
  if (normalizedPhones.length === 0) {
    return NextResponse.json(
      { error: "At least one valid notification phone is required" },
      { status: 400 }
    );
  }

  const cleanedLeadSnap =
    typeof leadSnapWebhook === "string" && leadSnapWebhook.trim().length > 0
      ? leadSnapWebhook.trim()
      : null;

  try {
    const { company, user } = await onboardCompany({
      name: name.trim(),
      notificationPhones: normalizedPhones,
      leadSnapWebhook: cleanedLeadSnap,
      userEmail: userEmail.trim(),
      userPassword,
    });

    return NextResponse.json(
      {
        company,
        user: { email: user.email, password: userPassword },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }
    throw error;
  }
}
