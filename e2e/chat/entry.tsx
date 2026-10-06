import { useState } from "react";
import { createRoot } from "react-dom/client";
import MessagingPanel from "@/components/shared/MessagingPanel";
import { publishMessages } from "./firestore";
import "../../frontend/src/app/globals.css";

function Fixture() {
  const [session, setSession] = useState(1);
  const [open, setOpen] = useState(true);
  return <main style={{ maxWidth: 480, height: 600, margin: "2rem auto", padding: 16 }}>
    <h1>Chat fixture</h1>
    <button onClick={() => publishMessages([
      { id: "admin-1", text: "Service update", from: "admin", senderName: "Alex", senderId: "admin-1", timestamp: null },
      { id: "driver-1", text: "At Alpha", from: "driver", senderName: "Sam", senderId: "driver-1", timestamp: null },
    ])}>Load messages</button>
    <button onClick={() => setSession(value => value + 1)}>Change session</button>
    <button onClick={() => setOpen(true)}>Open chat</button>
    <p role="status">Session qa-session-{session}</p>
    {open && <MessagingPanel sessionId={`qa-session-${session}`} currentUserRole="passenger"
      currentUserId="qa-passenger" isOverlay onClose={() => setOpen(false)} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
