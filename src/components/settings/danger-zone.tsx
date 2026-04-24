'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export function DangerZone() {
  const router = useRouter();
  const { reset } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/profile/delete', { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not delete account. Email dtglover21@gmail.com for help.');
        setLoading(false);
        return;
      }
      reset();
      router.push('/login');
    } catch {
      setError('Could not delete account. Email dtglover21@gmail.com for help.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 bg-card border border-destructive/30 rounded-2xl p-5">
      <h2 className="text-destructive font-semibold mb-1">Danger zone</h2>
      <p className="text-muted-foreground text-xs mb-4">
        Permanently delete your account and all data. This cannot be undone.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => { setOpen(true); setConfirmText(''); setError(''); }}
        className="h-10 px-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive rounded-xl text-sm gap-2"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete my account
      </Button>

      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent showCloseButton={false} className="bg-card border-border">
          <DialogTitle className="text-foreground font-bold text-base">
            Delete your account?
          </DialogTitle>

          <p className="text-muted-foreground text-sm">
            This will permanently erase all your transactions, accounts, goals, income sources, and settings.{' '}
            <strong className="text-foreground">There is no undo.</strong>
          </p>

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">
              Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="h-11 bg-input border-border text-foreground font-mono placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-destructive focus-visible:outline-none"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-destructive text-xs">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
              className="flex-1 h-11 border-border text-muted-foreground hover:bg-muted rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || loading}
              className="flex-1 h-11 bg-destructive hover:bg-destructive/90 text-white font-semibold rounded-xl disabled:opacity-40"
            >
              {loading ? 'Deleting…' : 'Delete everything'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
