import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { z } from 'zod';

const outcomeSchema = z.object({
  decision_id: z.string().uuid(),
  outcome: z.enum(['bought', 'skipped']),
  transaction_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = outcomeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const update: Record<string, unknown> = { outcome: parsed.data.outcome };
  if (parsed.data.transaction_id) update.outcome_transaction_id = parsed.data.transaction_id;

  const service = createServiceClient();
  await service
    .from('purchase_decisions')
    .update(update)
    .eq('id', parsed.data.decision_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
