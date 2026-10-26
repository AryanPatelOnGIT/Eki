import { useEffect } from "react";

// Admin panels unmount when another section opens, which drops their drafts.
const dirtySources = new Set<symbol>();

/** True while any mounted editor reports unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return dirtySources.size > 0;
}

/** Report unsaved edits so section switches and page unloads can warn first. */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const source = Symbol("unsaved-changes");
    dirtySources.add(source);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      dirtySources.delete(source);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}
