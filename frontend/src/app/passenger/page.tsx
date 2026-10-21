"use client";

import dynamic from "next/dynamic";
import WorkspaceLoading from "@/components/shared/WorkspaceLoading";

const PassengerWorkspace = dynamic(
  () => import("@/components/passenger/PassengerWorkspace"),
  { ssr: false, loading: () => <WorkspaceLoading label="Loading passenger panel…" /> },
);

export default function PassengerPage() {
  return <PassengerWorkspace />;
}
