import Anthropic from '@anthropic-ai/sdk';
import { INSIGHT_VOICE_PROMPT } from '@/lib/ai/insight-voice-prompt';
import type { DailyInsight } from '@/types/insight';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateInsight(ctx: unknown): Promise<DailyInsight> {
  const userMessage = `Here's the user's current money picture:\n\n${JSON.stringify(ctx, null, 2)}\n\nWhat's today's insight?`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: INSIGHT_VOICE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed?.headline || !parsed?.body || !parsed?.kind) {
    throw new Error('Invalid insight: missing required fields');
  }
  if (parsed.headline.split(' ').length > 12) {
    throw new Error(`Headline exceeds 12 words: "${parsed.headline}"`);
  }

  return parsed as DailyInsight;
}
