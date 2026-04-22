import Anthropic from '@anthropic-ai/sdk';
import type { CandidateStory } from './fetch-rss';
import type { DailyCategory } from '@/types/daily';

interface FilteredSelection {
  source_id: string;
  category: DailyCategory;
}

const FILTER_SYSTEM = `You are selecting stories for Sika Daily, a finance and tech digest for young African (primarily Ghanaian) readers aged 18-35.

Given the following candidate headlines, select exactly 4 stories that will resonate most with this audience. Prioritize:
- Stories that reveal something surprising about money, wealth, or markets
- African startups, founders, or economic developments
- Tech industry moves that affect consumer products young people use
- Stories about young people building wealth or winning

Avoid:
- Purely political stories
- Crime/tragedy/disaster
- Content requiring deep financial expertise to understand
- Stories older than 48 hours

Return a JSON array of 4 objects:
{ "source_id": "...", "category": "world_markets|africa_rising|tech_trends|young_money" }`;

export async function filterStories(candidates: CandidateStory[]): Promise<FilteredSelection[]> {
  if (candidates.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const candidateList = candidates
    .map((c, i) => `[${i}] source_id="${c.source_id}" category="${c.category}" title="${c.title}"`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: FILTER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Here are the candidate stories:\n\n${candidateList}\n\nReturn a JSON array of exactly 4 selected story objects.`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as FilteredSelection[];
    return parsed.slice(0, 4);
  } catch {
    return [];
  }
}
