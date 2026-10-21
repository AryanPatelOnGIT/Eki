import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { singleRouteParam } from "../lib/requestParams";
import { requestPrivacyDeletion, listPrivacyDeletions, recoverPrivacyDeletion, validPrivacyUid, PrivacyConflict } from "../services/privacyDeletionRequests";

type AuthenticatedRequest = Request & {
  user?: { uid: string; role?: string; admin?: boolean };
};

const router = Router();
export const privacyDeletionRequestsRouter = Router();

const requestDeletion = async (req: AuthenticatedRequest, res: Response) => {
  res.set("Cache-Control", "no-store");
  if (!req.user?.uid || req.user.admin === true || (req.user.role !== undefined && req.user.role !== "passenger")) {
    res.status(409).json({
      error: "Operator and administrator accounts must be offboarded by university IT.",
    });
    return;
  }
  try {
    await requestPrivacyDeletion(req.user.uid);
    res.status(202).json({ accepted: true });
  } catch (error) {
    const conflict = error instanceof PrivacyConflict;
    if (!conflict) res.set("Retry-After", "1");
    res.status(conflict ? 409 : 503).json({ error: conflict ? "Account eligibility requires IT review." : "Queue acknowledgement unavailable; retry the same passenger request." });
  }
};

router.post("/deletion-request", requireAuth, requestDeletion);
privacyDeletionRequestsRouter.post("/", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.set("Cache-Control", "no-store");
  if (req.body !== undefined &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
       Object.keys(req.body).length !== 0)) {
    res.status(400).json({ error: "Deletion requests do not accept a request body." });
    return;
  }
  void requestDeletion(req, res);
});

privacyDeletionRequestsRouter.get("/", requireAdmin, async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const cursor = req.query.cursor;
  if (Object.keys(req.query).some(key => key !== "cursor") || (cursor !== undefined && !validPrivacyUid(cursor))) {
    res.status(400).json({ error: "A valid document cursor is required." }); return;
  }
  try { res.json(await listPrivacyDeletions(cursor as string | undefined)); }
  catch { res.set("Retry-After", "1").status(503).json({ error: "Queue status unavailable." }); }
});
privacyDeletionRequestsRouter.post("/:uid/recovery", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.set("Cache-Control", "no-store");
  const uid = singleRouteParam(req.params.uid), body = req.body;
  if (!validPrivacyUid(uid) || !body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["expectedExecutorId", "expectedGeneration", "executorStopped"].includes(key)) ||
      typeof body.expectedExecutorId !== "string" || !/^(legacy|[0-9a-f-]{36})$/.test(body.expectedExecutorId) ||
      !Number.isSafeInteger(body.expectedGeneration) || body.expectedGeneration < 0 ||
      (body.executorStopped !== undefined && body.executorStopped !== true)) {
    res.status(400).json({ error: "Current executor identity and generation are required." }); return;
  }
  try { res.json(await recoverPrivacyDeletion(uid, { ...body, adminUid: req.user?.uid ?? "" })); }
  catch (error) {
    const conflict = error instanceof PrivacyConflict;
    if (!conflict) res.set("Retry-After", "1");
    res.status(conflict ? 409 : 503).json({ error: conflict ? "Recovery is not eligible; stop and audit prior execution first." : "Recovery acknowledgement unavailable; inspect queue status." });
  }
});

export default router;

