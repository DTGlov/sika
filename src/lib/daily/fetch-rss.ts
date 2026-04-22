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
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

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
