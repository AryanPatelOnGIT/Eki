"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

function NavigationFeedback({ children, anchorRef }: { children: ReactNode; anchorRef: RefObject<HTMLAnchorElement | null> }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      const anchor = anchorRef.current;
      if (!anchor || anchor.origin !== window.location.origin || anchor.href === window.location.href ||
          (anchor.target && anchor.target !== "_self")) return;
      // A stalled client navigation must not strand a rider on "Opening…".
      // A plain same-origin link performs a document load
      // without re-entering Next's stalled client-navigation handler.
      (anchor.cloneNode(false) as HTMLAnchorElement).click();
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [pending, anchorRef]);

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
  const anchorRef = useRef<HTMLAnchorElement>(null);
  return (
    <Link {...props} ref={anchorRef} prefetch={true} className={`relative ${className ?? ""}`}>
      <NavigationFeedback anchorRef={anchorRef}>{children}</NavigationFeedback>
    </Link>
  );
}
