export interface Account {
  slug: string;
  name: string;
  groupSlug: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  status: string | null;
  role: string | null;
  channels: string[];
  hidden: boolean;
}

export interface Group {
  slug: string;
  name: string;
}

export interface GroupWithAccounts extends Group {
  accounts: Account[];
}

export interface SyncRun {
  id: number;
  trigger: string;
  months: string[];
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  accountsOk: number;
  accountsFailed: number;
  errors: { account: string; message: string }[];
}
