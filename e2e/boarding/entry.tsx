import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PassengerBoardingView from "@/components/passenger/PassengerBoardingView";
import "../../frontend/src/app/globals.css";

const route = { id: "qa-route", name: "QA route", color: "#3B82F6", waypoints: [], stops: [
  { id: "alpha", name: "Alpha", shortName: "A", lat: 23, lng: 72 },
  { id: "beta", name: "Beta", shortName: "B", lat: 23.01, lng: 72.01 },
] };
const nativePosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);

function Fixture() {
  const [session, setSession] = useState(1);
  const [mounted, setMounted] = useState(true);
  const [hold, setHold] = useState(false);
  const [releaseResult, setReleaseResult] = useState("none");
  const [pending, setPending] = useState<null | { success: PositionCallback; failure: PositionErrorCallback; options?: PositionOptions }>(null);
  useEffect(() => {
    navigator.geolocation.getCurrentPosition = (success, failure, options) => {
      if (hold) setPending({ success, failure: failure ?? (() => {}), options });
      else nativePosition(success, failure, options);
    };
    return () => { navigator.geolocation.getCurrentPosition = nativePosition; };
  }, [hold]);
  return <main style={{ maxWidth: 440, margin: "2rem auto", padding: 16 }}>
    <h1>Boarding fixture</h1>
    <button onClick={() => setHold(true)}>Hold GPS</button>
    <button onClick={() => { if (pending) {
      nativePosition(position => { pending.success(position); setReleaseResult("delivered"); },
        error => { pending.failure(error); setReleaseResult("failed"); }, pending.options);
      setPending(null);
    } }}>Release GPS</button>
    <button onClick={() => setSession(value => value + 1)}>Change session</button>
    <button onClick={() => setMounted(false)}>Unmount boarding</button>
    <button onClick={() => setMounted(true)}>Mount boarding</button>
    <p role="status">Session qa-session-{session}; GPS {pending ? "pending" : "idle"}; release {releaseResult}</p>
    {mounted && <PassengerBoardingView key={session} sessionId={`qa-session-${session}`} route={route} tripState="in_service" />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
