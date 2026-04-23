import { createClient } from '@/lib/supabase/server';
import { fetchRssSources, fetchAllCandidates } from './fetch-rss';
import { filterStories } from './filter-stories';
import { summarizeStory } from './summarize';
import type { DailyDigest, DailyStory } from '@/types/daily';

const PLACEHOLDER_STORY: DailyStory = {
  id: crypto.randomUUID(),
  category: 'world_markets',
  title: 'Quiet day in the markets',
  summary: "The world took a breath today. We're back tomorrow with fresh picks. In the meantime — check your budget, maybe? 🌾",
  source_name: 'Sika Daily',
  source_url: '',
  emoji: '🌾',
  published_at: new Date().toISOString(),
  image_url: null,
};

export async function generateDigest(): Promise<{ success: boolean; digest_date: string; is_fallback: boolean; story_count: number }> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Skip if today's digest already exists
  const { data: existing } = await supabase
    .from('sika_daily_digests')
    .select('id')
    .eq('digest_date', today)
    .single();

  if (existing) {
    return { success: true, digest_date: today, is_fallback: false, story_count: 0 };
  }

  let stories: DailyStory[] = [];
  let isFallback = false;

  try {
    // 1. Fetch sources + candidates
    const sources = await fetchRssSources(supabase);
    const candidates = await fetchAllCandidates(sources);

    if (candidates.length > 0) {
      // 2. Filter: Claude picks 4 best stories
      const selected = await filterStories(candidates);

      if (selected.length > 0) {
        // 3. Summarize each selected story
        const candidateMap = new Map(candidates.map(c => [c.source_id, c]));

        const summarized = await Promise.allSettled(
          selected.map(async sel => {
            // Find the best matching candidate for this source
            const candidate = candidateMap.get(sel.source_id);
            if (!candidate) return null;

            const { title, summary, emoji } = await summarizeStory(candidate);

            const story: DailyStory = {
              id: crypto.randomUUID(),
              category: sel.category,
              title,
              summary,
              emoji,
              source_name: candidate.source_name,
              source_url: candidate.source_url,
              published_at: candidate.published_at,
              image_url: candidate.image_url,
            };
            return story;
          })
        );

        stories = summarized
          .filter(r => r.status === 'fulfilled' && r.value !== null)
          .map(r => (r as PromiseFulfilledResult<DailyStory>).value);
      }
    }
  } catch {
    // Pipeline failed — fall through to fallback logic
  }

  // Fallback logic
  if (stories.length === 0) {
    isFallback = true;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data: yesterdayDigest } = await supabase
      .from('sika_daily_digests')
      .select('stories')
      .eq('digest_date', yesterday)
      .single();

    if (yesterdayDigest?.stories) {
      stories = yesterdayDigest.stories as DailyStory[];
    } else {
      stories = [PLACEHOLDER_STORY];
    }
  }

  // 4. Store digest
  await supabase.from('sika_daily_digests').insert({
    digest_date: today,
    stories,
    is_fallback: isFallback,
    generated_at: new Date().toISOString(),
  });

  // 5. Cleanup old digests (keep only 2 most recent)
  await supabase.rpc('cleanup_old_digests');

  return { success: true, digest_date: today, is_fallback: isFallback, story_count: stories.length };
}

export async function getTodayDigest(): Promise<DailyDigest | null> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('sika_daily_digests')
    .select('*')
    .eq('digest_date', today)
    .single();

  return data as DailyDigest | null;
}

export async function hasUserReadDigest(userId: string, digestDate: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_daily_reads')
    .select('id')
    .eq('user_id', userId)
    .eq('digest_date', digestDate)
    .single();

  return !!data;
}
