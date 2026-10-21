import { Loader2 } from "lucide-react";

export default function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-full place-items-center bg-[var(--surface-0)] text-[var(--text-secondary)]"
      style={{ height: "100dvh" }}
    >
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}
