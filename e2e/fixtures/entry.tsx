import { createRoot } from "react-dom/client";
import { useState } from "react";
import PassengerWorkspace from "@/components/passenger/PassengerWorkspace";
import SettingsPanel from "@/components/admin/SettingsPanel";
import { setScenario, useScenario } from "./state";
import "../../frontend/src/app/globals.css";
function Fixture() {
  const scenario = useScenario();
  const [surface, setSurface] = useState("passenger");
  return <><aside style={{ position: "fixed", top: 0, left: 0, zIndex: 2000, background: "#fff", color: "#000", padding: 8 }} aria-label="QA fixture controls">
    <label>View <select aria-label="QA view" value={surface} onChange={e => setSurface(e.target.value)}><option>passenger</option><option>settings</option></select></label>
    <label>Scenario <select aria-label="QA scenario" value={scenario} onChange={e => setScenario(e.target.value)}>{["pending", "forward", "reverse", "multiple", "device", "empty", "completed"].map(value => <option key={value}>{value}</option>)}</select></label>
    <span> Isolated synthetic data; no Firebase connection</span>
  </aside>{surface === "passenger" ? <PassengerWorkspace /> : <div style={{ paddingTop: 80 }}><SettingsPanel /></div>}</>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
