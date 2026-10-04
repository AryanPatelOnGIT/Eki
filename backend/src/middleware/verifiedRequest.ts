import type { Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyRevocationAwareIdToken } from "../services/authTokenVerifier";

const verified = new WeakMap<Request, { token: string; principal: DecodedIdToken }>();

/** Reuse authentication only within the same request and for the same token. */
export async function verifyRequestToken(req: Request, token: string): Promise<DecodedIdToken> {
  const previous = verified.get(req);
  if (previous?.token === token) return previous.principal;
  const principal = await verifyRevocationAwareIdToken(token);
  verified.set(req, { token, principal });
  return principal;
}
