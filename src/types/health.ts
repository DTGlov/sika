export interface HealthFactor {
  id: FactorId;
  name: string;
  weight: number; // 0-100, sum must be 100
  score: number; // 0-100, this factor's score
  description: string; // one-line factual statement
  tip: string | null; // actionable tip when score is low, null when fine
}

export type FactorId =
  | 'emergency_coverage'
  | 'budget_discipline'
  | 'consistency'
  | 'goal_commitment'
  | 'diversification';

export interface HealthScore {
  total: number; // 0-100 weighted sum of factors
  label: HealthLabel;
  factors: HealthFactor[];
}

export type HealthLabel = 'excellent' | 'good' | 'fair' | 'needs_attention' | 'critical';

export const LABEL_THRESHOLDS: Array<{ min: number; label: HealthLabel; displayName: string; color: string }> = [
  { min: 80, label: 'excellent',       displayName: 'Excellent',       color: '#00D9A3' },
  { min: 60, label: 'good',            displayName: 'Good',            color: '#10B981' },
  { min: 40, label: 'fair',            displayName: 'Fair',            color: '#FBBF24' },
  { min: 20, label: 'needs_attention', displayName: 'Needs attention', color: '#F97316' },
  { min: 0,  label: 'critical',        displayName: 'Critical',        color: '#F43F5E' },
];

export const FACTOR_WEIGHTS: Record<FactorId, number> = {
  emergency_coverage: 25,
  budget_discipline:  25,
  consistency:        20,
  goal_commitment:    20,
  diversification:    10,
};

export const FACTOR_NAMES: Record<FactorId, string> = {
  emergency_coverage: 'Emergency coverage',
  budget_discipline:  'Budget discipline',
  consistency:        'Consistency',
  goal_commitment:    'Goal commitment',
  diversification:    'Diversification',
};

export function getLabelConfig(total: number) {
  return LABEL_THRESHOLDS.find(t => total >= t.min)!;
}
