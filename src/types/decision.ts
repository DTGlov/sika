export type Verdict = 'go_ahead' | 'not_now' | 'only_if' | 'think_about_it';

export type DecisionData = {
  verdict: Verdict;
  verdict_line: string;
  reasoning: string;
  impact: {
    bucket_after: { bucket: 'needs' | 'wants' | 'savings'; pct_after: number; over_budget: boolean };
    goal_impact?: { goal_name: string; pct_of_goal: number; comment: string };
    opportunity_cost?: string;
  };
  accent: 'green' | 'amber' | 'red' | 'blue';
};

export type PurchaseDecisionBucket = 'needs' | 'wants' | 'savings';
export type PurchaseUrgency = 'now' | 'can_wait' | 'not_sure';
