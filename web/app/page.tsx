'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getApplications,
  runSync,
  connectGmailUrl,
  type Application,
  type ApplicationStatus,
  type SyncResult,
} from '../lib/api';

// Status -> label + Tailwind classes. One source of truth so the badge, the
// summary chip and the counts all agree. Colours chosen to read in light and
// dark, and to map intuitively: green = good news, red = rejection, grey = quiet.
const STATUS_META: Record<
  ApplicationStatus,
  { label: string; badge: string }
> = {
  APPLIED: { label: 'Applied', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  ACKNOWLEDGED: { label: 'Acknowledged', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  SCREENING: { label: 'Screening', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' },
  INTERVIEW: { label: 'Interview', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  OFFER: { label: 'Offer', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  GHOSTED: { label: 'Ghosted', badge: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
};

const STATUS_ORDER: ApplicationStatus[] = [
  'INTERVIEW',
  'OFFER',
  'SCREENING',
  'ACKNOWLEDGED',
  'APPLIED',
  'GHOSTED',
  'REJECTED',
];

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  // On first load, read the userId either from the OAuth redirect (?userId=...)
  // or from localStorage if we've connected before. Persist it so a refresh
  // keeps you "logged in".
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('userId');
    const stored = localStorage.getItem('userId');
    const id = fromUrl ?? stored;
    if (fromUrl) {
      localStorage.setItem('userId', fromUrl);
      window.history.replaceState({}, '', '/'); // clean the URL
    }
    if (id) setUserId(id);
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setApps(await getApplications(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) load(userId);
  }, [userId, load]);

  async function handleSync() {
    if (!userId) return;
    setSyncing(true);
    setError(null);
    try {
      setLastSync(await runSync(userId));
      await load(userId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  // Not connected yet — the entry point.
  if (!userId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 p-8 text-center dark:bg-zinc-950">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Applied
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Connect your Gmail and Applied works out the real status of every job
          application — who rejected you, who went quiet, who to chase.
        </p>
        <a
          href={connectGmailUrl}
          className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Connect Gmail
        </a>
      </main>
    );
  }

  const counts = STATUS_ORDER.map((s) => ({
    status: s,
    n: apps.filter((a) => a.status === s).length,
  })).filter((c) => c.n > 0);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Applied
          </h1>
          <p className="text-sm text-zinc-500">
            {apps.length} application{apps.length === 1 ? '' : 's'} tracked
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {syncing ? 'Syncing…' : 'Sync Gmail'}
        </button>
      </header>

      {lastSync && (
        <p className="mb-4 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          Last sync: fetched {lastSync.fetched}, {lastSync.jobRelated} job-related,{' '}
          {lastSync.transitions} status change{lastSync.transitions === 1 ? '' : 's'}.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Status summary chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        {counts.map(({ status, n }) => (
          <span
            key={status}
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_META[status].badge}`}
          >
            {STATUS_META[status].label}: {n}
          </span>
        ))}
      </div>

      {loading && apps.length === 0 ? (
        <p className="text-zinc-500">Loading…</p>
      ) : apps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            No applications yet. Hit <strong>Sync Gmail</strong> to scan your inbox.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ApplicationCard({ app }: { app: Application }) {
  const meta = STATUS_META[app.status];
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            {app.company}
          </h2>
          {app.role && <p className="text-sm text-zinc-500">{app.role}</p>}
          <p className="mt-1 text-xs text-zinc-400">
            {app._count.messages} email{app._count.messages === 1 ? '' : 's'} · last
            activity {new Date(app.lastEventAt).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${meta.badge}`}
        >
          {meta.label}
        </span>
      </div>

      {/* Timeline of status transitions — the StatusEvent history, made visible */}
      {app.events.length > 0 && (
        <ol className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
          {app.events.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="text-zinc-400">
                {new Date(e.createdAt).toLocaleDateString()}
              </span>
              <span>
                {e.from ? `${e.from} → ` : ''}
                <strong className="text-zinc-700 dark:text-zinc-300">{e.to}</strong>
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
