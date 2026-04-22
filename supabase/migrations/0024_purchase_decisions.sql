CREATE TABLE purchase_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('needs', 'wants', 'future')),
  urgency text CHECK (urgency IN ('now', 'can_wait', 'not_sure')),
  decision_data jsonb NOT NULL,
  outcome text CHECK (outcome IN ('bought', 'skipped', 'undecided')) DEFAULT 'undecided',
  outcome_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_decisions_user_created
  ON purchase_decisions(user_id, created_at DESC);

ALTER TABLE purchase_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own decisions"
  ON purchase_decisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decisions"
  ON purchase_decisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decisions"
  ON purchase_decisions FOR UPDATE
  USING (auth.uid() = user_id);
