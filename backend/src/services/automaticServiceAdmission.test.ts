import {beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({run:vi.fn(),start:vi.fn(),failure:vi.fn()}));
vi.mock("../lib/boundedKeyedExecutor",()=>({BoundedKeyedExecutor:class {run(...args:unknown[]){return state.run(...args);}}}));
vi.mock("../lib/firebaseAdmin",()=>({db:{collection:(name:string)=>({
  where:()=>({limit:()=>({get:async()=>({size:1,docs:[{id:"driver"}]})})}),
  doc:()=>({get:async()=>({data:()=>name==="bus_locations"?{}:{stops:[]}})}),
})},rtdb:{}}));
vi.mock("../lib/endpointSnapshotVersion",()=>({endpointSnapshotVersion:()=>"route-version"}));
vi.mock("./rideSessionStart",()=>({startAssignedService:state.start,RideSessionStartError:class extends Error{},SessionCreationConflict:class extends Error{}}));
vi.mock("../lib/backgroundFailureTracker",()=>({recordBackgroundFailure:state.failure}));
const assignment={busId:"bus",routeId:"route",deviceId:"device",assignmentRevision:1};
const sample=()=>({lat:23,lng:72,speed:0,heading:0,gpsHdop:1,motionState:"stopped" as const,seq:1,timestamp:Date.now(),deviceSentAt:Date.now()});
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
it("handles synchronous capacity rejection without escaping telemetry background scheduling",async()=>{
  const exhausted=new Error("capacity exhausted");state.run.mockImplementation(()=>{throw exhausted;});
  const {scheduleAutomaticServiceAdmission,drainAutomaticServiceAdmission}=await import("./automaticServiceAdmission");
  expect(()=>scheduleAutomaticServiceAdmission(assignment,sample())).not.toThrow();
  await drainAutomaticServiceAdmission();
  expect(state.failure).toHaveBeenCalledWith("devices.automaticService","Automatic service setup",expect.any(String),exhausted);
  scheduleAutomaticServiceAdmission(assignment,sample());expect(state.run).toHaveBeenCalledTimes(1);
});
it("contains a synchronous capacity rejection while rescheduling the retained latest fix",async()=>{
  let finish!:()=>void;state.start.mockReturnValue(new Promise<void>(resolve=>{finish=resolve;}));
  const exhausted=new Error("reschedule capacity exhausted");
  state.run.mockImplementationOnce((_key:string,work:()=>Promise<void>)=>work()).mockImplementation(()=>{throw exhausted;});
  const {scheduleAutomaticServiceAdmission,drainAutomaticServiceAdmission}=await import("./automaticServiceAdmission");
  scheduleAutomaticServiceAdmission(assignment,sample());await vi.waitFor(()=>expect(state.start).toHaveBeenCalledOnce());
  scheduleAutomaticServiceAdmission(assignment,{...sample(),seq:2});
  const drained=drainAutomaticServiceAdmission();finish();await drained;
  expect(state.run).toHaveBeenCalledTimes(2);
  expect(state.failure).toHaveBeenCalledWith("devices.automaticService","Automatic service setup",expect.any(String),exhausted);
});
