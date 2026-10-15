/** Match only device endpoints that authenticate with a device credential. */
export function isDeviceIngressPath(method: string, path: string): boolean {
  return (method === "POST" && /^\/api\/devices\/[A-Za-z0-9_-]{1,128}\/(?:telemetry|diagnostics|firmware\/installation)$/i.test(path)) ||
    (method === "GET" && /^\/api\/devices\/[A-Za-z0-9_-]{1,128}\/firmware$/i.test(path));
}
