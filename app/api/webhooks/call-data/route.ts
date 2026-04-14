import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls, companyAgents } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      call_id,
      agent_id,
      date,
      name,
      phone,
      address,
      zipcode,
      city,
      service,
      summary,
    } = body;

    if (!call_id || !agent_id) {
      return NextResponse.json(
        { error: "call_id and agent_id are required" },
        { status: 400 }
      );
    }

    const agent = await db.query.companyAgents.findFirst({
      where: eq(companyAgents.agentId, agent_id),
    });

    const existing = await db.query.calls.findFirst({
      where: and(eq(calls.callId, call_id), eq(calls.agentId, agent_id)),
    });

    if (existing) {
      await db
        .update(calls)
        .set({
          customerName: name,
          customerPhone: phone,
          customerAddress: address,
          customerZipcode: zipcode,
          customerCity: city,
          service,
          summary,
          callDate: date,
          companyId: agent?.companyId ?? existing.companyId,
          webhook1Received: true,
          updatedAt: new Date(),
        })
        .where(eq(calls.id, existing.id));
    } else {
      await db.insert(calls).values({
        callId: call_id,
        agentId: agent_id,
        companyId: agent?.companyId ?? null,
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        customerZipcode: zipcode,
        customerCity: city,
        service,
        summary,
        callDate: date,
        webhook1Received: true,
        webhook2Received: false,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook call-data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
