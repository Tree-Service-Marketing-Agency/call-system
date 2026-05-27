import type { TranscriptTurn } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<TranscriptTurn["role"], string> = {
  agent: "Agent",
  user: "Customer",
};

export function CallTranscript({
  transcript,
}: {
  transcript: TranscriptTurn[] | null;
}) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-5 text-sm text-muted-foreground">
        No transcript available for this call.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex flex-col gap-3">
        {transcript.map((turn, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-col gap-1 rounded-lg px-4 py-3",
              turn.role === "user" ? "bg-accent" : "bg-muted",
            )}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {ROLE_LABELS[turn.role]}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
              {turn.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
