'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useAuthStore } from '@/stores/auth-store';
import {
  isPushSupported,
  isSubscribedToPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push-subscriptions';

export function NotificationSettings() {
  const pushEnabled = useFeatureFlag('experimental_push_notifications');
  const user = useAuthStore((s) => s.user);

  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSupported(isPushSupported());
  }, []);

  useEffect(() => {
    if (!mounted || !supported || !pushEnabled) return;
    isSubscribedToPush().then(setSubscribed);
  }, [mounted, supported, pushEnabled]);

  if (!mounted || !pushEnabled) return null;

  async function handleToggle(next: boolean) {
    if (!user || working) return;
    setWorking(true);
    try {
      if (next) {
        const ok = await subscribeToPush(user.id);
        if (ok) {
          setSubscribed(true);
          toast.success('Notifications enabled');
        } else {
          toast.error('Could not enable. Check browser settings.');
        }
      } else {
        const ok = await unsubscribeFromPush(user.id);
        if (ok) {
          setSubscribed(false);
          toast.success('Notifications disabled');
        }
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold mb-1">Push notifications</h2>
            <p className="text-muted-foreground text-xs">
              {supported
                ? 'Income reminders and your daily insight, sent to this device.'
                : 'Not supported in this browser. Add Sika to your home screen and try again.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => handleToggle(!subscribed)}
          disabled={!supported || working}
          role="switch"
          aria-checked={subscribed}
          className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            subscribed ? 'bg-accent' : 'bg-muted'
          } ${!supported || working ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              subscribed ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
