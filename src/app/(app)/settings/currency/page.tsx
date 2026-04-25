'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyPicker } from '@/components/settings/currency-picker';
import { useAuthStore } from '@/stores/auth-store';
import { TopBar } from '@/components/layout/top-bar';

export default function CurrencySettingsPage() {
  const router = useRouter();
  const { profile, setProfile } = useAuthStore();
  const [selected, setSelected] = useState(profile?.currency ?? 'GHS');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (selected === profile?.currency) { router.back(); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profile/currency', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency_code: selected }),
      });
      if (!res.ok) throw new Error();
      if (profile) setProfile({ ...profile, currency: selected });
      toast.success('Currency updated');
      router.back();
    } catch {
      toast.error('Failed to update currency');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <TopBar />
      <div className="px-4 md:px-8 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-foreground font-bold text-lg">Currency</h1>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-muted-foreground text-xs mb-4">
            All amounts in the app will display in your chosen currency. No conversion is applied.
          </p>
          <CurrencyPicker value={selected} onChange={setSelected} />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 bg-accent text-[#0E1A2E] font-semibold rounded-xl transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
