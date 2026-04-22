'use client';

import { useState, useRef, useEffect } from 'react';
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
      // TODO: wire prefill when /transactions supports ?item=&amount=&bucket= params
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
        className="bg-[#141416] border-t border-[#27272A] rounded-t-3xl px-4 pb-8 pt-4 max-h-[92svh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-[#27272A] rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[#FAFAFA] text-lg font-bold">
            {phase === 'result' ? "Here's the read" : 'Should I buy it?'}
          </h2>
          <button
            onClick={onClose}
            className="text-[#52525B] hover:text-[#71717A] transition-colors p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* INPUT PHASE */}
        {phase === 'input' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">What is it?</label>
              <Input
                ref={itemRef}
                placeholder="e.g. New headphones, Dinner at Kofe..."
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleAsk()}
                className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#52525B] focus-visible:ring-[#00D9A3]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">How much? (₵)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-mono text-sm pointer-events-none">₵</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleAsk()}
                  className="h-12 pl-7 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#52525B] focus-visible:ring-[#00D9A3]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Which bucket?</label>
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
                        borderColor: active ? cfg.color : '#27272A',
                        backgroundColor: active ? cfg.bg : '#1C1C1F',
                        color: active ? cfg.color : '#71717A',
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[#A1A1AA] text-sm">Urgency?</label>
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
                        borderColor: active ? '#00D9A3' : '#27272A',
                        backgroundColor: active ? '#00D9A318' : '#1C1C1F',
                        color: active ? '#00D9A3' : '#71717A',
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
            <p className="text-[#71717A] text-sm">Sika is thinking...</p>
          </div>
        )}

        {/* RESULT PHASE */}
        {phase === 'result' && decision && (
          <div className="space-y-4">
            {/* Verdict banner */}
            <div
              className="rounded-2xl px-4 py-4 border"
              style={{ backgroundColor: accent.bg, borderColor: accent.border + '40' }}
            >
              <div className="flex items-start gap-3">
                <AccentIcon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent.text }} />
                <div>
                  <p className="text-[#FAFAFA] font-bold text-base leading-snug">{decision.verdict_line}</p>
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
            <div className="bg-[#1C1C1F] rounded-2xl px-4 py-4 space-y-3">
              <p className="text-[#71717A] text-xs font-semibold uppercase tracking-wider">The math</p>

              <div className="flex justify-between items-center">
                <span className="text-[#A1A1AA] text-sm capitalize">{decision.impact.bucket_after.bucket} after</span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: decision.impact.bucket_after.over_budget ? '#F43F5E' : '#FAFAFA' }}
                >
                  {decision.impact.bucket_after.pct_after}%
                  {decision.impact.bucket_after.over_budget && (
                    <span className="text-[#F43F5E] ml-1 text-xs">over budget</span>
                  )}
                </span>
              </div>

              {decision.impact.goal_impact && (
                <div className="border-t border-[#27272A] pt-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[#A1A1AA] text-sm">{decision.impact.goal_impact.goal_name}</span>
                    <span className="text-[#FAFAFA] text-sm font-semibold tabular-nums shrink-0">
                      {decision.impact.goal_impact.pct_of_goal}% of goal
                    </span>
                  </div>
                  <p className="text-[#71717A] text-xs mt-1">{decision.impact.goal_impact.comment}</p>
                </div>
              )}

              {decision.impact.opportunity_cost && (
                <div className="border-t border-[#27272A] pt-3">
                  <p className="text-[#71717A] text-xs">
                    <span className="text-[#A1A1AA]">Alternatively: </span>
                    {decision.impact.opportunity_cost}
                  </p>
                </div>
              )}
            </div>

            {/* Reasoning */}
            <div className="bg-[#141416] border border-[#27272A] rounded-2xl px-4 py-4">
              <p className="text-[#71717A] text-xs font-semibold uppercase tracking-wider mb-2">Sika says</p>
              <p className="text-[#A1A1AA] text-sm leading-relaxed whitespace-pre-line">{decision.reasoning}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => handleOutcome('skipped')}
                className="flex-1 h-12 border-[#27272A] text-[#A1A1AA] hover:bg-[#1C1C1F] rounded-xl"
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
            <p className="text-[#A1A1AA] text-sm text-center">{errorMsg || 'Something went wrong.'}</p>
            <Button
              onClick={() => setPhase('input')}
              className="bg-[#1C1C1F] hover:bg-[#27272A] text-[#FAFAFA] border border-[#27272A] rounded-xl px-6"
            >
              Try again
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
