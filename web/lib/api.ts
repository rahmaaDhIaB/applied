// Tiny typed client for the Applied API. Keeping the fetch calls in one place
// means components deal in data, not URLs.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ApplicationStatus =
  | 'APPLIED'
  | 'ACKNOWLEDGED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'
  | 'GHOSTED';

export interface StatusEvent {
  id: string;
  from: ApplicationStatus | null;
  to: ApplicationStatus;
  reason: string;
  createdAt: string;
}

export interface Application {
  id: string;
  company: string;
  companyKey: string;
  role: string | null;
  status: ApplicationStatus;
  appliedAt: string;
  lastEventAt: string;
  events: StatusEvent[];
  _count: { messages: number };
}

export interface SyncResult {
  fetched: number;
  jobRelated: number;
  applicationsTouched: number;
  transitions: number;
}

export async function getApplications(userId: string): Promise<Application[]> {
  const res = await fetch(
    `${API}/sync/applications?userId=${encodeURIComponent(userId)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Failed to load applications (${res.status})`);
  return res.json();
}

export async function runSync(userId: string): Promise<SyncResult> {
  const res = await fetch(
    `${API}/sync?userId=${encodeURIComponent(userId)}`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  return res.json();
}

export const connectGmailUrl = `${API}/auth/google`;
