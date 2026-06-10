import * as React from "react";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

type Size = keyof typeof SIZES;

interface AvatarProps extends React.ComponentProps<"span"> {
  name: string;
  size?: Size;
}

function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function Avatar({
  name,
  size = "md",
  className,
  style,
  ...props
}: AvatarProps) {
  const hue = hueFromName(name);
  return (
    <span
      data-slot="avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-foreground",
        SIZES[size],
        className,
      )}
      style={{
        backgroundColor: `hsl(${hue}, 30%, 92%)`,
        color: `hsl(${hue}, 50%, 28%)`,
        ...style,
      }}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
