import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { signInGuest, signInWithGoogle } from '../../data/firebase';
import { claimPerson, joinWithCode } from '../../data/repo';
import { refreshUser, reportError, useStore } from '../../data/store';
import type { Person } from '../../data/types';
import { dateRange } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { IconClock } from '../../ui/icons';
import { Logo } from '../../ui/misc';
import { write } from '../../data/repo';

/**
 * US-04. Opening /join/{tripId}?code=… signs the person in anonymously, creates
 * their member record with the code (the rules check it), then they tap
 * their name. With approval on, they wait and see only the names.
 */
export function JoinPage() {
  const { tripId = '' } = useParams();
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const authState = useStore((s) => s.auth);
  const ready = useStore((s) => s.ready);
  const me = useStore((s) => s.me);
  const t = useStore((s) => s.trips[tripId]);
  const [result, setResult] = useState<'idle' | 'joining' | 'joined' | 'waiting' | 'denied'>('idle');
  const [taken, setTaken] = useState<string | null>(null);

  useEffect(() => {
    if (authState === 'signedOut') signInGuest().catch(reportError);
  }, [authState]);

  const isMember = !!t?.members[me.uid];
  useEffect(() => {
    if (authState !== 'signedIn' || !ready || isMember || result !== 'idle') return;
    setResult('joining');
    joinWithCode(tripId, code).then(setResult);
  }, [authState, ready, isMember, result, tripId, code]);

  if (result === 'denied' && !isMember)
    return (
      <Shell>
        <h1 className="sign mb-2 text-xl">Link expired</h1>
        <p className="text-muted">This invite link was reset or doesn’t exist. Ask the organizer for the new one.</p>
      </Shell>
    );

  const member = t?.members[me.uid];
  if (!t || !member || !t.trip)
    return (
      <Shell>
        <p className="py-8 text-center text-muted">Opening the invite…</p>
      </Shell>
    );

  const people = Object.values(t.people).sort((a, b) => a.joinOrder - b.joinOrder);
  const names = people.map((p) => p.name);
  const organizer = people.find((p) => p.claimedBy === t.trip.organizerUid);
  const orgName = organizer?.name ?? 'the organizer';
  const going = people.filter((p) => p.status === 'going').length;

  function pick(p: Person) {
    if (p.claimedBy && p.claimedBy !== me.uid) {
      setTaken(p.name);
      return;
    }
    setTaken(null);
    claimPerson(tripId, p.id);
  }

  // Waiting for approval: only the list of names is visible.
  if (!member.approved && member.personId) {
    const as = t.people[member.personId]?.name ?? '';
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-tint text-primary">
            <IconClock width={32} height={32} />
          </div>
          <h1 className="sign text-xl">Waiting for {orgName}</h1>
          <p className="mt-2 text-muted">
            You asked to join {t.trip.name} as {as}. You can see the plan once {orgName} approves.
          </p>
        </div>
        <div className="mt-6 rounded-[16px] border border-line p-4">
          <div className="mb-2 text-sm font-semibold">Who’s going</div>
          <div className="flex flex-wrap gap-3">
            {people.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 text-sm">
                <Avatar name={p.name} joinOrder={p.joinOrder} size={26} peers={names} /> {p.name}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          This trip asks the organizer to approve new people. Keep this page open, or come back with the same link.
        </p>
        <Button
          variant="secondary"
          block
          size="lg"
          className="mt-6"
          onClick={() => {
            write(tripId, 'members', me.uid, null, 'cancelled a join request');
            setResult('denied');
          }}
        >
          Cancel request
        </Button>
      </Shell>
    );
  }

  if (member.approved && member.personId && t.people[member.personId]?.claimedBy === me.uid) {
    const as = t.people[member.personId]?.name ?? '';
    return (
      <Shell>
        <h1 className="sign text-xl">You’re in, {as}</h1>
        <p className="mt-2 text-muted">You joined {t.trip.name}. Open this link again any time to come back.</p>
        {me.isAnonymous && (
          <p className="mt-3 rounded-[12px] bg-surface p-3 text-sm text-muted">
            Your name is saved on this browser. Using another phone? Sign in with Google, or ask {orgName} to free up your name.
          </p>
        )}
        <Link
          to={`/t/${t.trip.id}`}
          className="mt-6 flex min-h-12.5 items-center justify-center rounded-[10px] bg-primary font-semibold text-white"
        >
          Open the plan
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-sm text-muted">{organizer?.name ?? 'Someone'} invited you to</div>
      <h1 className="sign text-3xl">{t.trip.name}</h1>
      <div className="text-sm text-muted">
        {dateRange(t.trip.startDate, t.trip.endDate, { year: false })} · {going} going
      </div>

      <h2 className="mt-8 text-lg font-semibold">Which one are you?</h2>
      <p className="mb-4 text-sm text-muted">Tap your name. No account needed.</p>
      <ul className="space-y-2">
        {people.map((p) => {
          const isTaken = !!p.claimedBy && p.claimedBy !== me.uid;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-3 text-left ${
                  isTaken ? 'border-line bg-surface' : 'border-input-border hover:border-primary'
                }`}
              >
                <Avatar name={p.name} joinOrder={p.joinOrder} peers={names} />
                <span className={`flex-1 font-semibold ${isTaken ? 'text-muted' : ''}`}>{p.name}</span>
                <span className="text-xs text-muted">{isTaken ? 'Already joined' : p.status === 'maybe' ? 'Maybe' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {taken && (
        <div role="alert" className="mt-4 rounded-[14px] bg-ink p-4 text-sm text-white">
          <p className="font-semibold">{taken} already joined.</p>
          <p className="mt-1">
            If that’s you: your name is saved on the browser you joined with. Using another phone? Sign in with Google, or ask {orgName} to
            free up your name.
          </p>
          {me.isAnonymous && (
            <button
              type="button"
              onClick={() => signInWithGoogle().then(refreshUser).catch(() => undefined)}
              className="mt-3 min-h-11 rounded-[10px] bg-white px-4 font-semibold text-ink"
            >
              Sign in with Google
            </button>
          )}
        </div>
      )}
      <p className="mt-8 text-center text-xs text-muted">Not on the list? Ask {orgName} to add you.</p>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="flex justify-center bg-primary pt-6 pb-16">
        <Logo variant="white" size={64} />
      </div>
      <div className="mx-auto -mt-10 max-w-[560px] px-4 pb-10">
        <div className="rounded-[20px] bg-paper p-5 shadow-sm sm:p-8">{children}</div>
      </div>
    </div>
  );
}
