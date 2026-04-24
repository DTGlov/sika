import { XMLParser } from 'fast-xml-parser';
import type { DailyCategory } from '@/types/daily';

export interface RssSource {
  id: string;
  name: string;
  rss_url: string;
  category: DailyCategory;
}

export interface CandidateStory {
  source_id: string;
  source_name: string;
  source_url: string;
  category: DailyCategory;
  title: string;
  description: string;
  published_at: string;
  image_url: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _extractImageUrlRaw(item: any): string | null {
  // 1. media:content (direct)
  const mediaContent = item['media:content'];
  if (mediaContent) {
    const arr = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
    for (const m of arr) {
      const url = m?.['@_url'];
      const medium = m?.['@_medium'];
      const type = m?.['@_type'] ?? '';
      if (url && (medium === 'image' || type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url))) {
        return url;
      }
    }
  }

  // 2. media:thumbnail (direct)
  const mediaThumb = item['media:thumbnail'];
  if (mediaThumb) {
    const arr = Array.isArray(mediaThumb) ? mediaThumb : [mediaThumb];
    const url = arr[0]?.['@_url'];
    if (url) return url;
  }

  // 3. media:group > media:content / media:thumbnail (BBC-style nesting)
  const mediaGroup = item['media:group'];
  if (mediaGroup) {
    const nestedContent = mediaGroup['media:content'];
    if (nestedContent) {
      const arr = Array.isArray(nestedContent) ? nestedContent : [nestedContent];
      for (const m of arr) {
        const url = m?.['@_url'];
        if (url) return url;
      }
    }
    const nestedThumb = mediaGroup['media:thumbnail'];
    if (nestedThumb) {
      const arr = Array.isArray(nestedThumb) ? nestedThumb : [nestedThumb];
      const url = arr[0]?.['@_url'];
      if (url) return url;
    }
  }

  // 4. enclosure with image type
  const enclosure = item.enclosure;
  if (enclosure) {
    const arr = Array.isArray(enclosure) ? enclosure : [enclosure];
    for (const e of arr) {
      const url = e?.['@_url'];
      const type = e?.['@_type'] ?? '';
      if (url && (type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url))) {
        return url;
      }
    }
  }

  // 5. itunes:image
  const itunesImage = item['itunes:image'];
  if (itunesImage) {
    const url = itunesImage['@_href'] ?? itunesImage;
    if (typeof url === 'string') return url;
  }

  // 6. image field (various shapes)
  if (item.image) {
    if (typeof item.image === 'string') return item.image;
    if (item.image.url) return typeof item.image.url === 'string' ? item.image.url : null;
    if (item.image['@_url']) return item.image['@_url'];
    if (item.image['#text']) return item.image['#text'];
  }

  // 7. content:encoded — first <img src=""> from full article HTML
  // Catches CNBC, Bloomberg, TechCrunch, WordPress feeds
  const contentEncoded = item['content:encoded'];
  if (contentEncoded) {
    const str = typeof contentEncoded === 'string'
      ? contentEncoded
      : contentEncoded?.['#text'] ?? String(contentEncoded);
    const match = str.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }

  // 8. description / summary HTML — first <img src="">
  const description = item.description ?? item.summary ?? item.content ?? '';
  const descStr = typeof description === 'string'
    ? description
    : description?.['#text'] ?? String(description);
  const descMatch = descStr.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (descMatch?.[1]) return descMatch[1];

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImageUrl(item: any): string | null {
  const url = _extractImageUrlRaw(item);
  if (!url) return null;
  // Discard relative URLs and data URIs — only keep absolute http(s) URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  return url;
}

export async function fetchRssSources(supabase: import('@supabase/supabase-js').SupabaseClient): Promise<RssSource[]> {
  const { data } = await supabase
    .from('sika_daily_sources')
    .select('id, name, rss_url, category')
    .eq('is_active', true);
  return (data ?? []) as RssSource[];
}

export async function fetchStoriesFromSource(source: RssSource): Promise<CandidateStory[]> {
  try {
    const res = await fetch(source.rss_url, {
      headers: { 'User-Agent': 'SikaDaily/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel ?? parsed?.feed;
    if (!channel) return [];

    // Handle both RSS (item) and Atom (entry) formats
    const rawItems: unknown[] = Array.isArray(channel.item)
      ? channel.item
      : channel.item
      ? [channel.item]
      : Array.isArray(channel.entry)
      ? channel.entry
      : channel.entry
      ? [channel.entry]
      : [];

    const cutoff = Date.now() - 48 * 60 * 60 * 1000;

    return rawItems
      .slice(0, 10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => {
        // TEMP DEBUG: log first item per source to identify RSS image field names
        if (rawItems.indexOf(item) === 0) {
          console.log(`[RSS DEBUG] Source: ${source.name}`);
          console.log(`[RSS DEBUG] Item keys:`, Object.keys(item));
          console.log(`[RSS DEBUG] media:content:`, JSON.stringify(item['media:content'])?.slice(0, 500));
          console.log(`[RSS DEBUG] media:thumbnail:`, JSON.stringify(item['media:thumbnail'])?.slice(0, 500));
          console.log(`[RSS DEBUG] enclosure:`, JSON.stringify(item.enclosure)?.slice(0, 500));
          console.log(`[RSS DEBUG] image:`, JSON.stringify(item.image)?.slice(0, 500));
          console.log(`[RSS DEBUG] description sample:`, String(item.description ?? '').slice(0, 300));
          console.log(`[RSS DEBUG] content:encoded sample:`, String(item['content:encoded'] ?? '').slice(0, 300));
          const extractedUrl = extractImageUrl(item);
          console.log(`[RSS DEBUG] Extracted image_url:`, extractedUrl);
        }

        const pubDate = item.pubDate ?? item.published ?? item.updated ?? '';
        const pubTime = pubDate ? new Date(pubDate).getTime() : 0;

        const link: string =
          typeof item.link === 'string'
            ? item.link
            : item.link?.['@_href'] ?? item.link?.['#text'] ?? '';

        return {
          source_id: source.id,
          source_name: source.name,
          source_url: link,
          category: source.category,
          title: String(item.title ?? '').replace(/<[^>]+>/g, '').trim(),
          description: String(item.description ?? item.summary ?? item.content ?? '')
            .replace(/<[^>]+>/g, '')
            .slice(0, 500)
            .trim(),
          published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          image_url: extractImageUrl(item),
          _pubTime: pubTime,
        };
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => s.title && (s._pubTime === 0 || s._pubTime > cutoff))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(({ _pubTime: _t, ...s }: any) => s);
  } catch {
    return [];
  }
}

export async function fetchAllCandidates(sources: RssSource[]): Promise<CandidateStory[]> {
  const results = await Promise.allSettled(
    sources.map(s => fetchStoriesFromSource(s))
  );
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
