import Anthropic from '@anthropic-ai/sdk';
import type { CandidateStory } from './fetch-rss';

interface SummarizedStory {
  title: string;
  summary: string;
  emoji: string;
}

const SUMMARIZE_SYSTEM = `You are writing for Sika Daily, a playful finance digest for young African readers. Rewrite the following story as a 2-3 sentence summary.

Voice guidelines:
- Playful but not silly
- Culturally aware (Ghana/Africa references welcome when relevant)
- Direct — no filler words like "Experts say" or "According to"
- Slightly spicy, like a group chat friend explaining something cool
- No investment advice. No "you should buy/sell."
- End with context of why this matters, not just what happened

Forbidden:
- Political takes
- Celebrity gossip
- Crypto price speculation
- Doom narratives

Also pick ONE emoji that visually captures the story (single emoji only).

Return JSON:
{ "title": "punchy 4-8 word headline", "summary": "2-3 sentence body", "emoji": "single emoji" }`;

export async function summarizeStory(story: CandidateStory): Promise<SummarizedStory> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const input = `Title: ${story.title}\n\nDescription: ${story.description}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SUMMARIZE_SYSTEM,
    messages: [{ role: 'user', content: input }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { title: story.title, summary: story.description.slice(0, 200), emoji: '📰' };
  }

  try {
    const parsed = JSON.parse(match[0]) as SummarizedStory;
    return {
      title:   String(parsed.title ?? story.title).slice(0, 100),
      summary: String(parsed.summary ?? '').slice(0, 600),
      emoji:   String(parsed.emoji ?? '📰').trim().slice(0, 4),
    };
  } catch {
    return { title: story.title, summary: story.description.slice(0, 200), emoji: '📰' };
  }
}
