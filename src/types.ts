export type PersonRole = 'main' | 'sub';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  status?: 'active' | 'left';
  leaveYear?: number;
}

export interface BillEntry {
  id: string;
  date: string; // ISO string for month/year
  dueDate?: string; // ISO string for due date
  totalAmount: number;
  splitDetails: {
    [personId: string]: number; // Amount owed by each person
  };
  isPaid: {
    [personId: string]: boolean;
  };
  paidAt?: {
    [personId: string]: string; // Date when each person paid
  };
  settled?: boolean;
  settledAt?: string;
  peopleSnapshot?: Person[];
}

export interface BillAccount {
  id: string;
  payeeName: string;
  accountNumber?: string;
  people: Person[];
  bills: BillEntry[];
}

export interface AppState {
  accounts: BillAccount[];
  activeAccountId: string | null;
}
