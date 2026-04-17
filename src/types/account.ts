export type AccountType = 'bank' | 'momo' | 'cash' | 'savings' | 'investment' | 'other';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  icon: string | null;
  color: string | null;
  opening_balance: number;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AccountRef = Pick<Account, 'id' | 'name' | 'type' | 'color' | 'icon'>;
