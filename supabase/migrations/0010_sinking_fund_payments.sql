-- Mark an expense as "paid from a sinking fund goal" so bucket math can exclude it.
alter table transactions
  add column paid_from_goal_id uuid references goals on delete set null;

create index idx_transactions_paid_from_goal
  on transactions(paid_from_goal_id)
  where paid_from_goal_id is not null;

alter table transactions add constraint paid_from_goal_requires_expense check (
  paid_from_goal_id is null or type = 'expense'
);

-- Cycle tracking for sinking funds.
alter table goals
  add column previous_goal_id uuid references goals on delete set null,
  add column cycle_count int default 1;

create index idx_goals_cycle_chain
  on goals(previous_goal_id)
  where previous_goal_id is not null;
