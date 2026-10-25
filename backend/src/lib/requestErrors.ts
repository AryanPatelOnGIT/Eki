import type { NextFunction, Request, Response } from "express";

/**
 * Client-caused request failures raised by Express itself (JSON body parsing,
 * unsupported charsets/content encodings, corrupt compressed bodies and
 * undecodable route parameters) carry a 4xx `status` that is not marked
 * `expose: false`. Answer them with a fixed, generic message so malformed
 * client input never reaches the 500 handler (which logs it as a server
 * fault) and never echoes parser internals back to the caller.
 */
export function clientRequestErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const clientError = error as {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
  } | null;
  const status = typeof clientError?.status === "number"
    ? clientError.status
    : clientError?.statusCode;
  if (
    !clientError ||
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 400 ||
    status >= 500 ||
    clientError.expose === false ||
    res.headersSent
  ) {
    next(error);
    return;
  }
  if (clientError.type === "entity.too.large" || status === 413) {
    res.status(413).json({ error: "Request body is too large." });
  } else if (clientError.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body." });
  } else if (status === 415) {
    res.status(415).json({ error: "Unsupported request body encoding." });
  } else {
    res.status(status).json({ error: "Invalid request." });
  }
}
