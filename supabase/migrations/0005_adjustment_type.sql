-- Allow 'adjustment' as a transaction type (balance reconciliation).
-- Adjustments are stored with a SIGNED amount: positive = balance increases,
-- negative = balance decreases. They do NOT affect bucket totals.
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('expense', 'income', 'transfer', 'adjustment'));

-- Track whether the user has dismissed the "set your real balances" banner.
alter table profiles
  add column accounts_banner_dismissed boolean not null default false;
