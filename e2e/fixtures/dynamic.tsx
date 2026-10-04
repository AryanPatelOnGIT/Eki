import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic(loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) {
  const Component = lazy(loader);
  return function Dynamic(props: Record<string, unknown>) { return <Suspense fallback={<span>Loading fixture view…</span>}><Component {...props} /></Suspense>; };
}
