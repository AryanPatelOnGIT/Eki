import type { Request, Response } from "express";
import { singleRouteParam } from "../lib/requestParams";
import { OPERATION_ID, listRecoverableOperations, OperationRecoveryConflict, recoverOperation, type OperationCollection } from "../services/httpOperations";

export function operationRecovery(collection: OperationCollection) {
  return async (req: Request, res: Response) => {
    const id = singleRouteParam(req.params.operationId); const body = req.body;
    if (!id || !OPERATION_ID.test(id) || !body || Array.isArray(body) ||
      Object.keys(body).some(key => !["expectedExecutorId", "expectedGeneration", "executorStopped"].includes(key)) ||
      typeof body.expectedExecutorId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.expectedExecutorId) ||
      !Number.isSafeInteger(body.expectedGeneration) || body.expectedGeneration < 0 || body.executorStopped !== true) {
      res.status(400).json({ error: "Current recovery identity and executorStopped:true are required.", code: "INVALID_RECOVERY" }); return;
    }
    try {
      const adminUid = (req as Request & { user?: { uid?: string } }).user?.uid ?? "";
      res.json(await recoverOperation({ collection, id, ...body, adminUid }));
    } catch (error) {
      const conflict = error instanceof OperationRecoveryConflict;
      if (!conflict) res.set("Retry-After", "1");
      res.status(conflict ? 409 : 503).json({ error: conflict ? "Recovery is not eligible; inspect current status and stop the prior executor first." : "Recovery acknowledgement is unavailable; inspect status before retrying.",
        code: conflict ? "RECOVERY_CONFLICT" : "OPERATION_UNAVAILABLE" });
    }
  };
}

export function operationRecoveryList(collection: OperationCollection) {
  return async (req: Request, res: Response) => {
    const cursor = req.query.cursor;
    if (Object.keys(req.query).some(key => key !== "cursor") || (cursor !== undefined && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor)))) {
      res.status(400).json({ error: "Invalid recovery cursor.", code: "INVALID_CURSOR" }); return;
    }
    try { res.json(await listRecoverableOperations(collection, cursor as string | undefined)); }
    catch { res.set("Retry-After", "1").status(503).json({ error: "Recovery discovery is unavailable; retry the same cursor.", code: "OPERATION_UNAVAILABLE" }); }
  };
}
