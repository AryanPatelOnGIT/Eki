import { createRoot } from "react-dom/client";
import { useState } from "react";
import PassengerMap from "@/components/maps/PassengerMap";
import PassengerBoardingView from "@/components/passenger/PassengerBoardingView";
import type { PassengerStopEstimates } from "@/lib/passengerStopEstimates";
import { publish, route } from "./state";
import "../../frontend/src/app/globals.css";

function Fixture() {
  const [estimates, setEstimates] = useState<PassengerStopEstimates>();
  return <main style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#09090b", color: "white" }}>
    <header style={{ padding: 16, position: "relative", zIndex: 50 }}>
      <p>Synthetic GPS regression · actual passenger components</p>
      <PassengerBoardingView sessionId="synthetic-session" route={route} tripState="in_service" stopEstimates={estimates} />
      <button onClick={() => publish(3)}>Publish next stop</button>
      <button onClick={() => publish(2)}>Publish fresh fix</button>
    </header>
    <div style={{ position: "relative", zIndex: 0, flex: 1, minHeight: 0 }}>
      <PassengerMap route={route} targetStop={route.stops[3]} selectedBusKey="session:synthetic-session" onStopEstimatesChange={setEstimates} />
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
