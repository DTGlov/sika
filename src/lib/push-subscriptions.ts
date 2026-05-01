import { createClient } from '@/lib/supabase/client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return view;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('[Push] Not supported in this browser');
    return false;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[Push] Permission not granted');
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subscriptionJson = subscription.toJSON();
    if (!subscriptionJson.keys?.p256dh || !subscriptionJson.keys?.auth) {
      console.error('[Push] Subscription missing keys');
      return false;
    }

    const supabase = createClient();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh_key: subscriptionJson.keys.p256dh,
        auth_key: subscriptionJson.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      console.error('[Push] DB save failed', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Push] Subscribe failed', error);
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      const supabase = createClient();
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);
    }

    return true;
  } catch (error) {
    console.error('[Push] Unsubscribe failed', error);
    return false;
  }
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}
