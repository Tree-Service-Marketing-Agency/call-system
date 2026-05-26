"use client";

import { useRef, useState } from "react";

import { useMountEffect } from "@/hooks/use-mount-effect";
import { PlayIcon, SettingsIcon, SquareIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function formatSpeed(rate: number): string {
  return rate === 1 ? "Normal" : `${rate}x`;
}

export function InlineAudioPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const wasPlayingRef = useRef(false);
  const resolvingDurationRef = useRef(false);

  useMountEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  });

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  }

  function handleLoadedMetadata(e: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = e.currentTarget;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
      return;
    }
    // Streamed recordings often report duration === Infinity until the file
    // is fully scanned. Force the browser to compute it by seeking past the
    // end; the resulting durationchange yields the real value, then we rewind.
    resolvingDurationRef.current = true;
    try {
      audio.currentTime = 1e101;
    } catch {
      resolvingDurationRef.current = false;
    }
  }

  function handleDurationChange(e: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = e.currentTarget;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    setDuration(audio.duration);
    if (resolvingDurationRef.current) {
      resolvingDurationRef.current = false;
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }

  function seekFromPointer(clientX: number) {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !Number.isFinite(duration) || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    const next = ratio * duration;
    audio.currentTime = next;
    setCurrentTime(next);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    wasPlayingRef.current = !audio.paused;
    if (wasPlayingRef.current) audio.pause();
    setIsScrubbing(true);
    seekFromPointer(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbing) return;
    seekFromPointer(e.clientX);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbing) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsScrubbing(false);
    const audio = audioRef.current;
    if (audio && wasPlayingRef.current) {
      void audio.play();
      setIsPlaying(true);
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-3.5",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={(e) => {
          if (resolvingDurationRef.current) return;
          if (!isScrubbing) setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="default"
        className="size-10 rounded-full"
        onClick={toggle}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <SquareIcon /> : <PlayIcon />}
      </Button>
      <div className="flex flex-1 flex-col gap-1.5">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={currentTime}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || duration <= 0) return;
            const step = e.shiftKey ? 10 : 5;
            if (e.key === "ArrowRight") {
              e.preventDefault();
              const next = Math.min(duration, audio.currentTime + step);
              audio.currentTime = next;
              setCurrentTime(next);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              const next = Math.max(0, audio.currentTime - step);
              audio.currentTime = next;
              setCurrentTime(next);
            }
          }}
          className={cn(
            "group relative flex h-4 cursor-pointer items-center touch-none select-none",
            "focus-visible:outline-none",
            duration <= 0 && "pointer-events-none opacity-60",
          )}
        >
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                "absolute inset-y-0 left-0 bg-primary",
                !isScrubbing && "transition-[width] duration-100",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className={cn(
              "absolute size-3 -translate-x-1/2 rounded-full bg-primary shadow ring-2 ring-background",
              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              isScrubbing && "opacity-100",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <div className="flex items-center gap-1">
            <span>{formatTime(duration)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Playback speed ${formatSpeed(playbackRate)}`}
                    className="size-6 text-muted-foreground hover:text-foreground"
                  >
                    <SettingsIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[7rem]">
                <DropdownMenuRadioGroup
                  value={String(playbackRate)}
                  onValueChange={(value) => {
                    const rate = Number(value);
                    setPlaybackRate(rate);
                    const audio = audioRef.current;
                    if (audio) audio.playbackRate = rate;
                  }}
                >
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <DropdownMenuRadioItem
                      key={speed}
                      value={String(speed)}
                      className="font-sans"
                    >
                      {formatSpeed(speed)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
