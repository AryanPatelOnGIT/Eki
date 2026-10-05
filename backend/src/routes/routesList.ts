import { Router, Request, Response } from "express";
import { db } from "../lib/firebaseAdmin";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
export const routesCollectionRoutes = Router();

/**
 * GET /api/routes-list
 *
 * Returns all BRTS routes with their stops for the frontend planner dropdowns.
 * Data comes from Firestore — no Google API calls.
 *
 * Concurrent requests share one bounded Firestore read; later requests
 * re-read so edits/deletions remain immediately visible.
 */
type RouteSummary = { id: string; name: unknown; color: unknown; stops: unknown };
let pendingRoutes: Promise<RouteSummary[]> | null = null;
function readRouteSummaries(): Promise<RouteSummary[]> {
  if (pendingRoutes) return pendingRoutes;
  const request = db.collection("routes").limit(250).get().then(snapshot =>
    snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? doc.id,
        color: data.color ?? "#3b82f6",
        stops: data.stops ?? [],
      };
    }),
  );
  pendingRoutes = request;
  void request.finally(() => { if (pendingRoutes === request) pendingRoutes = null; }).catch(() => {});
  return request;
}
const listRoutes = async (_req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  try {
    const routes = await readRouteSummaries();
    res.json({ routes });
  } catch (err) {
    console.error("❌ /api/routes-list error:", err);
    res.status(500).json({ error: "Failed to fetch routes" });
  }
};

router.get("/", requireAuth, listRoutes);
routesCollectionRoutes.get("/", requireAuth, listRoutes);

export default router;
