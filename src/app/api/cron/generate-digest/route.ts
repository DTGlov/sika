// Called daily by Vercel Cron at 6am UTC
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { generateDigest } = await import('@/lib/daily/generate-digest');
  const result = await generateDigest();
  return Response.json(result);
}
