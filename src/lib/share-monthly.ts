'use client';

export type ShareMonthlyOpts = {
  recapId: string;
  title: string;
  text: string;
  url: string;
};

export type ShareResult =
  | { success: true; method: 'native-with-image' | 'native-url-only' | 'clipboard' }
  | { success: false; reason: 'user-cancelled' | 'unsupported' | 'error'; error?: unknown };

export async function shareMonthly(opts: ShareMonthlyOpts): Promise<ShareResult> {
  const { recapId, title, text, url } = opts;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const imgRes = await fetch(`/monthly-share/${recapId}/opengraph-image`);
      if (!imgRes.ok) throw new Error('Image fetch failed');

      const blob = await imgRes.blob();
      const file = new File([blob], `sika-monthly-${recapId}.png`, {
        type: blob.type || 'image/png',
      });

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
        return { success: true, method: 'native-with-image' };
      }

      await navigator.share({ title, text, url });
      return { success: true, method: 'native-url-only' };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, reason: 'user-cancelled' };
      }
      // Image fetch or share failed — fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return { success: true, method: 'clipboard' };
  } catch (err) {
    return { success: false, reason: 'error', error: err };
  }
}
