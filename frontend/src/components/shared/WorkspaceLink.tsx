"use client";

import type { ComponentProps, ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

function NavigationFeedback({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span className={pending ? "contents invisible" : "contents"} aria-hidden={pending || undefined}>
        {children}
      </span>
      {pending && (
        <span role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Opening…
        </span>
      )}
    </>
  );
}

export default function WorkspaceLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props} prefetch={true} className={`relative ${className ?? ""}`}>
      <NavigationFeedback>{children}</NavigationFeedback>
    </Link>
  );
}
