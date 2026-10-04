import type { Request, RequestHandler } from "express";
import { createIdentityAwareLimiter } from "./rateLimitIdentity";
import { requireAuth } from "../middleware/requireAuth";
import { shardedLimit } from "./rateLimitShard";

const pathOf = (req: Request) => req.originalUrl.split("?")[0];
export const isMutation = (req: Request) => ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);

export function isDeviceIngressRequest(req: Request): boolean {
  const path = pathOf(req);
  return (req.method === "POST" && /^\/api\/devices\/[A-Za-z0-9_-]{1,128}\/(telemetry|diagnostics|firmware\/installation)$/.test(path)) ||
    (req.method === "GET" && /^\/api\/devices\/[A-Za-z0-9_-]{1,128}\/firmware$/.test(path));
}

export function isPublicProbe(req: Request): boolean {
  return ["GET", "HEAD"].includes(req.method) && ["/health", "/live"].includes(pathOf(req));
}

/** Mount after CORS, before parsing/authentication. Headers cannot bypass this guard. */
export function createBrowserIngressLimiter(replicas: number, limit = 1000): RequestHandler {
  return createIdentityAwareLimiter({ windowMs: 60_000, limit: shardedLimit(limit, replicas),
    message: { error: "Too many requests, please slow down." },
    skip: req => req.method === "OPTIONS" || isPublicProbe(req) || isDeviceIngressRequest(req) });
}

/** Mount on /api before browser routers; hardware retains its separate authentication. */
export function createBrowserAdmission(replicas: number, limits = { read: 200, mutation: 30 }): RequestHandler {
  const reads = createIdentityAwareLimiter({ windowMs: 60_000, limit: shardedLimit(limits.read, replicas),
    verifiedUser: true, message: { error: "Read rate limit exceeded." } });
  const mutations = createIdentityAwareLimiter({ windowMs: 60_000, limit: shardedLimit(limits.mutation, replicas),
    verifiedUser: true, message: { error: "Write rate limit exceeded." } });
  return (req, res, next) => {
    if (isDeviceIngressRequest(req)) { next(); return; }
    void requireAuth(req, res, error => {
      if (error) { next(error); return; }
      if (!req.user?.uid) { res.status(401).json({ error: "Authentication required." }); return; }
      if (["GET", "HEAD"].includes(req.method) && pathOf(req) === "/api/health") { next(); return; }
      (isMutation(req) ? mutations : reads)(req, res, next);
    });
  };
}
