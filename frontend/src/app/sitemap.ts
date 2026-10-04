import { MetadataRoute } from 'next';
import { siteOrigin, siteIndexingEnabled } from "@/lib/siteMetadata";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteIndexingEnabled()) return [];
  const baseUrl = siteOrigin();

  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
