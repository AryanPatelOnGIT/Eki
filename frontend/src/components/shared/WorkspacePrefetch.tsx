"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function WorkspacePrefetch({ destination }: { destination: "/admin" | "/passenger" }) {
  const { user, loading, roleError } = useAuth();
  const router = useRouter();
  const verifiedAdmin = !loading && !roleError && user?.role === "admin";

  useEffect(() => {
    if (!verifiedAdmin) return;

    router.prefetch(destination);
    // Route prefetch alone does not load these ssr:false components. Download
    // their code ahead of the click, without mounting them or starting reads.
    const code = destination === "/admin"
      ? Promise.all([
        import("@/components/admin/DashboardPanel"),
        import("@/components/MapProviders"),
      ])
      : import("@/components/passenger/PassengerWorkspace");

    // A failed speculative download must not break the current workspace;
    // normal navigation can retry it when the user follows the link.
    void code.catch(() => {});
  }, [destination, router, verifiedAdmin]);

  return null;
}
