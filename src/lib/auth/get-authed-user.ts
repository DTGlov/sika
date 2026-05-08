import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Extracts the authenticated user from a request, supporting two paths:
 *
 * 1. Bearer token (native clients like iOS):
 *    Authorization: Bearer <jwt>
 *    The token is verified against Supabase's auth servers via
 *    auth.getUser(token).
 *
 * 2. Session cookie (browser clients):
 *    sb-xxxxx-auth-token cookie set by the web login flow.
 *    Read via the existing server-side createClient().
 *
 * Bearer takes precedence when present. Both paths converge on the
 * same User object.
 *
 * Returns null if neither path produces a valid user.
 */
export async function getAuthedUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get('authorization');

  // Path 1: Bearer token (native clients)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const tokenClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await tokenClient.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  }

  // Path 2: Cookie session (browser clients) — existing behavior
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
