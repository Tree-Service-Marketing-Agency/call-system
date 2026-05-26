import type { Metadata } from "next";
import Image from "next/image";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { isAudioExpired } from "@/lib/recording";
import { InlineAudioPlayer } from "@/components/calls/inline-audio-player";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import logo from "@/public/logo.svg";

// ADR-009: public, unauthenticated page. Keep it out of search indexes.
export const metadata: Metadata = {
  title: "Grabación de llamada",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatRecordingDate(callDate: string | null, createdAt: Date): string {
  if (callDate && callDate.trim().length > 0) return callDate;
  return dateFormatter.format(createdAt);
}

function UnavailableCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 pt-2 text-center">
          <Image
            src={logo}
            alt="Lola"
            width={56}
            height={56}
            className="size-14"
            priority
          />
          <CardTitle className="text-xl font-semibold tracking-tight">
            Grabación de llamada
          </CardTitle>
          <CardDescription>
            Esta grabación no está disponible.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// ADR-009: the [id] segment is the internal calls.id (UUID), used as a
// bearer key. The query is minimized to exactly what's needed to play the
// Recording — never transcript, cost, billing, or customer PII.
export default async function AudioCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const call = await db.query.calls.findFirst({
    where: eq(calls.id, id),
    columns: { audioUrl: true, createdAt: true, callDate: true },
  });

  // Single generic state for the three non-playable cases (missing row,
  // missing/empty audio, expired Recording). Don't reveal which one.
  const playable = Boolean(
    call &&
      call.audioUrl &&
      call.audioUrl.trim().length > 0 &&
      !isAudioExpired(call.createdAt),
  );

  if (!playable || !call?.audioUrl) {
    return <UnavailableCard />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 pt-2 text-center">
          <Image
            src={logo}
            alt="Lola"
            width={56}
            height={56}
            className="size-14"
            priority
          />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl font-semibold tracking-tight">
              Grabación de llamada
            </CardTitle>
            <CardDescription>
              {formatRecordingDate(call.callDate, call.createdAt)}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <InlineAudioPlayer src={call.audioUrl} className="border-b-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
