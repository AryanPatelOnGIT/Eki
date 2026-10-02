export default function FixturePanel({ sessionId }: { sessionId?: string }) {
  return <div>Isolated map or panel {sessionId || ""}</div>;
}
