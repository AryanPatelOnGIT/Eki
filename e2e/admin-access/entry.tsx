import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import RoleGuard from "@/components/shared/RoleGuard";
import FeedbackPanel from "@/components/admin/FeedbackPanel";
import { approveVerification, rejectVerification, switchAccount, signOut, tokenWaiting, subscribeTokenWaiting } from "./firebase";
import "../../frontend/src/app/globals.css";
function Fixture() {
  const waiting = useSyncExternalStore(subscribeTokenWaiting, tokenWaiting);
  return <>
  <aside aria-label="Synthetic verification controls" style={{ position: "fixed", top: 0, zIndex: 2000, background: "white", color: "black", padding: 8 }}>
    <button disabled={!waiting} onClick={approveVerification}>Approve verification</button>{" "}
    <button disabled={!waiting} onClick={rejectVerification}>Reject verification</button>{" "}
    <button onClick={switchAccount}>Switch account</button>{" "}
    <button onClick={() => void signOut()}>Synthetic sign out</button>
  </aside>
  <AuthProvider><RoleGuard allowedRoles={["admin"]}><div style={{ paddingTop: 65 }}>
    <FeedbackPanel embedded={new URLSearchParams(location.search).has("embedded")} />
  </div></RoleGuard></AuthProvider>
</>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
