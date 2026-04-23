'use client';

import { useState, useRef, useEffect } from 'react';
import { useHaptics } from '@/hooks/use-haptics';
import { useRouter } from 'next/navigation';
import { Loader2, X, TrendingUp, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DecisionData, PurchaseDecisionBucket, PurchaseUrgency } from '@/types/decision';

type Phase = 'input' | 'loading' | 'result' | 'error';

const BUCKET_CONFIG: Record<PurchaseDecisionBucket, { label: string; color: string; bg: string }> = {
  needs: { label: 'Needs', color: '#00D9A3', bg: '#00D9A318' },
  wants: { label: 'Wants', color: '#FBBF24', bg: '#FBBF2418' },
  future: { label: 'Future', color: '#60A5FA', bg: '#60A5FA18' },
};

const URGENCY_CONFIG: Record<PurchaseUrgency, { label: string }> = {
  now: { label: 'Need it now' },
  can_wait: { label: 'Can wait' },
  not_sure: { label: 'Not sure' },
};

const ACCENT_CONFIG: Record<string, { border: string; bg: string; text: string; icon: React.ElementType }> = {
  green: { border: '#00D9A3', bg: '#00D9A318', text: '#00D9A3', icon: CheckCircle },
  amber: { border: '#FBBF24', bg: '#FBBF2418', text: '#FBBF24', icon: HelpCircle },
  red:   { border: '#F43F5E', bg: '#F43F5E18', text: '#F43F5E', icon: AlertTriangle },
  blue:  { border: '#60A5FA', bg: '#60A5FA18', text: '#60A5FA', icon: TrendingUp },
};

interface DecisionSheetProps {
  onClose: () => void;
}

export function DecisionSheet({ onClose }: DecisionSheetProps) {
  const router = useRouter();
  const { medium: hapticMedium } = useHaptics();
  const [phase, setPhase] = useState<Phase>('input');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [bucket, setBucket] = useState<PurchaseDecisionBucket>('wants');
  const [urgency, setUrgency] = useState<PurchaseUrgency | ''>('');
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const itemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === 'input') {
      setTimeout(() => itemRef.current?.focus(), 100);
    }
  }, [phase]);

  const canSubmit = itemName.trim().length > 0 && parseFloat(amount) > 0;

  async function handleAsk() {
    if (!canSubmit) return;
    setPhase('loading');
    try {
      const res = await fetch('/api/decisions/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: itemName.trim(),
          amount: parseFloat(amount),
          bucket,
          urgency: urgency || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to get decision');
      const data = await res.json();
      setDecisionId(data.id);
      setDecision(data.decision);
      setPhase('result');
      hapticMedium();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('error');
    }
  }

  async function handleOutcome(outcome: 'bought' | 'skipped') {
    if (decisionId) {
      try {
        await fetch('/api/decisions/outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision_id: decisionId, outcome }),
        });
      } catch {
        // silent fail — outcome is best-effort
      }
    }
    if (outcome === 'bought') {
      router.push('/transactions');
    }
    onClose();
  }

  const accentKey = decision?.accent ?? 'blue';
  const accent = ACCENT_CONFIG[accentKey] ?? ACCENT_CONFIG.blue;
  const AccentIcon = accent.icon;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-card border-t border-border rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          {phase === 'result' ? (
            <h2 className="text-foreground text-lg font-bold">Here's the read</h2>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="text-muted-foreground/70 hover:text-muted-foreground transition-colors p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* INPUT PHASE */}
        {phase === 'input' && (
          <div className="space-y-5 mt-2">
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">What is it?</label>
              <Input
                ref={itemRef}
                placeholder="e.g. New headphones, Dinner at Kofe..."
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleAsk()}
                className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">How much? (₵)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm pointer-events-none">₵</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleAsk()}
                  className="h-12 pl-7 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Which bucket?</label>
              <div className="flex gap-2">
                {(Object.keys(BUCKET_CONFIG) as PurchaseDecisionBucket[]).map((b) => {
                  const cfg = BUCKET_CONFIG[b];
                  const active = bucket === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBucket(b)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all"
                      style={{
                        borderColor: active ? cfg.color : 'var(--border)',
                        backgroundColor: active ? cfg.bg : 'var(--input)',
                        color: active ? cfg.color : 'var(--muted-foreground)',
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-muted-foreground text-sm">Urgency?</label>
              <div className="flex gap-2">
                {(Object.keys(URGENCY_CONFIG) as PurchaseUrgency[]).map((u) => {
                  const active = urgency === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(active ? '' : u)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all"
                      style={{
                        borderColor: active ? '#00D9A3' : 'var(--border)',
                        backgroundColor: active ? '#00D9A318' : 'var(--input)',
                        color: active ? '#00D9A3' : 'var(--muted-foreground)',
                      }}
                    >
                      {URGENCY_CONFIG[u].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleAsk}
              disabled={!canSubmit}
              className="w-full h-13 bg-[#00D9A3] hover:bg-[#00B088] disabled:opacity-40 text-[#0A0A0B] font-semibold text-base rounded-xl"
            >
              Let Sika decide
            </Button>
          </div>
        )}

        {/* LOADING PHASE */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-8 h-8 text-[#00D9A3] animate-spin" />
            <p className="text-muted-foreground text-sm">Sika is thinking...</p>
          </div>
        )}

        {/* RESULT PHASE */}
        {phase === 'result' && decision && (
          <div className="space-y-4">
            {/* Verdict banner — accent colors are semantic brand, stay untouched */}
            <div
              className="rounded-2xl px-4 py-4 border"
              style={{ backgroundColor: accent.bg, borderColor: accent.border + '40' }}
            >
              <div className="flex items-start gap-3">
                <AccentIcon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent.text }} />
                <div>
                  <p className="text-foreground font-bold text-base leading-snug">{decision.verdict_line}</p>
                  <p
                    className="text-xs font-semibold mt-1 uppercase tracking-wider"
                    style={{ color: accent.text }}
                  >
                    {decision.verdict.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>

            {/* The math */}
            <div className="bg-muted rounded-2xl px-4 py-4 space-y-3">
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">The math</p>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm capitalize">{decision.impact.bucket_after.bucket} after</span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: decision.impact.bucket_after.over_budget ? '#F43F5E' : 'var(--foreground)' }}
                >
                  {decision.impact.bucket_after.pct_after}%
                  {decision.impact.bucket_after.over_budget && (
                    <span className="text-[#F43F5E] ml-1 text-xs">over budget</span>
                  )}
                </span>
              </div>

              {decision.impact.goal_impact && (
                <div className="border-t border-border pt-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-muted-foreground text-sm">{decision.impact.goal_impact.goal_name}</span>
                    <span className="text-foreground text-sm font-semibold tabular-nums shrink-0">
                      {decision.impact.goal_impact.pct_of_goal}% of goal
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">{decision.impact.goal_impact.comment}</p>
                </div>
              )}

              {decision.impact.opportunity_cost && (
                <div className="border-t border-border pt-3">
                  <p className="text-muted-foreground text-xs">
                    <span className="text-muted-foreground">Alternatively: </span>
                    {decision.impact.opportunity_cost}
                  </p>
                </div>
              )}
            </div>

            {/* Reasoning */}
            <div className="bg-card border border-border rounded-2xl px-4 py-4">
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Sika says</p>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{decision.reasoning}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => handleOutcome('skipped')}
                className="flex-1 h-12 border-border text-muted-foreground hover:bg-muted rounded-xl"
              >
                Nah, skip
              </Button>
              <Button
                onClick={() => handleOutcome('bought')}
                className="flex-1 h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
              >
                I bought it
              </Button>
            </div>
          </div>
        )}

        {/* ERROR PHASE */}
        {phase === 'error' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertTriangle className="w-8 h-8 text-[#F43F5E]" />
            <p className="text-muted-foreground text-sm text-center">{errorMsg || 'Something went wrong.'}</p>
            <Button
              onClick={() => setPhase('input')}
              className="bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl px-6"
            >
              Try again
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
