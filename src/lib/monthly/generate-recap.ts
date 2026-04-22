import Anthropic from '@anthropic-ai/sdk';
import { MONTHLY_VOICE_PROMPT } from '@/lib/ai/monthly-voice-prompt';
import type { MonthContext } from './compute-month-context';
import type { MonthlyCard } from '@/types/monthly';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateRecapCards(ctx: MonthContext): Promise<MonthlyCard[]> {
  const userMessage = `Here's the user's budget month:\n\n${JSON.stringify(ctx, null, 2)}\n\nWrite their recap.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: MONTHLY_VOICE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed) || parsed.length < 5 || parsed.length > 7) {
    throw new Error(`Invalid recap: expected 5-7 cards, got ${parsed?.length}`);
  }

  return parsed;
}
