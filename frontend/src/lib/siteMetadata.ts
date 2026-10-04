const DEFAULT_SITE_ORIGIN = "https://bustrack-be165.web.app";

/** One build-time origin for canonical, social metadata, robots and sitemap. */
export function resolveSiteOrigin(value: string | undefined, production = process.env.NODE_ENV === "production"): string {
  const raw = value?.trim() || DEFAULT_SITE_ORIGIN;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute public origin."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local && !production)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS origin without credentials, path, query or fragment.");
  }
  return url.origin;
}

export function siteOrigin(): string {
  return resolveSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

export function siteIndexingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SITE_INDEXING !== "false";
}
