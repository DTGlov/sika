import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  const { theme } = await request.json();

  if (!['light', 'dark', 'auto'].includes(theme)) {
    return new Response('Invalid theme', { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  await supabase
    .from('profiles')
    .update({ theme_preference: theme })
    .eq('id', user.id);

  return Response.json({ success: true });
}
