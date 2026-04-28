import * as React from "react";

import { cn } from "@/lib/utils";

export function PageBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-body"
      className={cn("flex flex-1 flex-col gap-5 px-7 pt-5 pb-7", className)}
      {...props}
    />
  );
}
