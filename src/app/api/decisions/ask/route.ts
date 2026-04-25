import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeDecisionContext } from '@/lib/decisions/compute-decision-context';
import { generateDecision } from '@/lib/decisions/generate-decision';
import { z } from 'zod';

const askSchema = z.object({
  item_name: z.string().min(1).max(120),
  amount: z.number().positive().max(10_000_000),
  bucket: z.enum(['needs', 'wants', 'savings']),
  urgency: z.enum(['now', 'can_wait', 'not_sure']).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parseResult = askSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid input', details: parseResult.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const ctx = await computeDecisionContext(service, user.id, parseResult.data);
  const decision = await generateDecision(ctx);

  const { data: saved, error } = await service
    .from('purchase_decisions')
    .insert({
      user_id: user.id,
      item_name: parseResult.data.item_name,
      amount: parseResult.data.amount,
      bucket: parseResult.data.bucket,
      urgency: parseResult.data.urgency ?? null,
      decision_data: decision,
    })
    .select()
    .single();

  if (error || !saved) {
    return NextResponse.json({ error: 'Failed to save decision' }, { status: 500 });
  }

  return NextResponse.json({ id: saved.id, decision });
}
