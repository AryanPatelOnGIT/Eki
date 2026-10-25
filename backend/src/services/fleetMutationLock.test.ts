import {expect,it,vi} from "vitest";
vi.mock("../lib/firebaseAdmin",()=>({db:{}}));
vi.mock("./httpOperations",()=>({OPERATION_EXECUTOR_ID:"test-executor",trackFleetLock:()=>()=>{}}));
import {FleetReconciliationBusy} from "./fleetMutationLock";
it("points operators to guarded recovery without suggesting automatic lock expiry",()=>{
  const error=new FleetReconciliationBusy();
  expect(error.message).toContain("/api/v2/fleet-reconciliation-jobs/lock");
  expect(error.message).toContain("previous executor has stopped");
});
