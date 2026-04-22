import Anthropic from '@anthropic-ai/sdk';
import { DECISION_VOICE_PROMPT } from '@/lib/ai/decision-voice-prompt';
import type { DecisionData } from '@/types/decision';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateDecision(ctx: unknown): Promise<DecisionData> {
  const userMessage = `Here's the context:\n\n${JSON.stringify(ctx, null, 2)}\n\nShould they buy it?`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: DECISION_VOICE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed?.verdict || !parsed?.verdict_line || !parsed?.reasoning) {
    throw new Error('Invalid decision: missing required fields');
  }
  if (parsed.verdict_line.split(' ').length > 12) {
    throw new Error(`Verdict line too long: "${parsed.verdict_line}"`);
  }

  return parsed as DecisionData;
}
