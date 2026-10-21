import { MetadataRoute } from 'next';
import { siteOrigin, siteIndexingEnabled } from "@/lib/siteMetadata";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  if (!siteIndexingEnabled()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/passenger', '/feedback', '/api/'],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
