import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe, useTrips } from '../../data/hooks';
import { signInWithGoogle, signOutUser } from '../../data/firebase';
import { importSampleTrips } from '../../data/seed';
import { saveProfile } from '../../data/repo';
import { refreshUser, useStore } from '../../data/store';
import type { TripData, TripStatus } from '../../data/types';
import { ago, dateRange, shortDate } from '../../lib/format';
import { peso, pesoExact, pesoRange, pesoShort } from '../../lib/money';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { IconAlert, IconBox, IconPin, IconUserPlus } from '../../ui/icons';
import { Card, Logo } from '../../ui/misc';
import { copyText, inviteUrl } from '../people/invite';
import { actor } from '../tripContext';
import { NewTrip } from './NewTrip';
import { useDuplicate } from './useDuplicate';
import { LoadingScreen } from '../auth/AuthScreens';
import { tripSummary } from './summary';

const STATUS_LABEL: Record<TripStatus, string> = { planning: 'Planning', ongoing: 'Ongoing', settled: 'Settled' };
const statusTone = (s: TripStatus) => (s === 'settled' ? 'success' : 'primary') as 'success' | 'primary';

/** "CEDAR, Impasug-ong" → "CEDAR"; "Damilag: get the tent" → "Damilag". */
const shortPlace = (p: string) => p.split(/[,:]/)[0].trim();

export function TripsList() {
  const trips = useTrips();
  const me = useMe();
  const nav = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const dup = useDuplicate();
  const [importing, setImporting] = useState(false);

  const list = useMemo(
    () =>
      Object.values(trips)
        .map((t) => ({ t, s: tripSummary(t, me.uid) }))
        .sort((a, b) => a.t.trip.startDate.localeCompare(b.t.trip.startDate)),
    [trips, me.uid],
  );
  // The greeting talks about the next trip. The dashboard (the blue banner
  // and the boxes under it) is only for the trip you pinned.
  const upcoming =
    list.find((x) => x.s.status === 'ongoing') ?? list.find((x) => x.s.status === 'planning' && x.s.daysToGo >= 0);
  const pinnedId = useStore((st) => st.profile.pinnedTripId);
  const pinned = list.find((x) => x.t.trip.id === pinnedId);
  const next = pinned;
  const togglePin = (id: string) => saveProfile({ pinnedTripId: pinnedId === id ? null : id });
  const groups: TripStatus[] = ['ongoing', 'planning', 'settled'];

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-2.5 sm:px-6">
          <Logo size={48} />
          <div className="flex items-center gap-3">
            {me.isAnonymous ? (
              // Organizers sign in with Google; linking keeps trips already joined.
              <Button onClick={() => signInWithGoogle().then(refreshUser).catch(() => undefined)}>Sign in to create trips</Button>
            ) : (
              <Button onClick={() => setNewOpen(true)}>New trip</Button>
            )}
            <details className="relative">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full" aria-label="Account">
                <Avatar name={me.name} joinOrder={next?.s.mine?.joinOrder ?? 0} peers={next?.s.people.map((p) => p.name)} />
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-[14px] border border-line bg-paper p-2 shadow-lg">
                <p className="px-3 py-2 text-sm text-muted">{me.isAnonymous ? 'Joined from a link' : `Signed in as ${me.name}`}</p>
                <Link to="/profile" className="flex min-h-11 items-center rounded-[10px] px-3 text-sm font-semibold hover:bg-surface">
                  Profile and settings
                </Link>
                {!me.isAnonymous && <button
                  type="button"
                  onClick={() => signOutUser()}
                  className="min-h-11 w-full rounded-[10px] px-3 text-left text-sm font-semibold hover:bg-surface"
                >
                  Sign out
                </button>}
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <p className="mb-5 text-muted">
          Hi {me.name}.{' '}
          {upcoming ? (
            upcoming.s.status === 'ongoing' ? (
              <>
                <strong className="text-ink">{upcoming.t.trip.name}</strong> is happening now.
              </>
            ) : (
              <>
                Your upcoming laag is in <strong className="text-ink">{upcoming.s.daysToGo === 1 ? '1 day' : `${upcoming.s.daysToGo} days`}</strong>.
              </>
            )
          ) : (
            'No trips coming up. Start one, or duplicate a past trip.'
          )}
        </p>

        {next && <Hero t={next.t} s={next.s} pinned={!!pinned} onPin={() => togglePin(next.t.trip.id)} />}
        {next && <Dashboard t={next.t} s={next.s} meUid={me.uid} />}
        {!next && list.length > 0 && (
          <div className="mb-2 flex items-center gap-3 rounded-[16px] border border-dashed border-input-border bg-paper p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary">
              <IconPin width={20} height={20} />
            </span>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">No trip pinned.</span> Tap <span className="font-semibold text-ink">Pin</span> on a
              trip below to see its dashboard here: what to bring, what still needs sorting out, and the latest changes.
            </p>
          </div>
        )}

        {groups.map((g) => {
          const xs = list.filter((x) => x.s.status === g && x.t.trip.id !== next?.t.trip.id);
          if (xs.length === 0) return null;
          return (
            <section key={g} className="mt-8">
              <h2 className="sign mb-3 text-xl">{STATUS_LABEL[g]}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {xs.map(({ t, s }) => (
                  <TripCard key={t.trip.id} t={t} s={s} onDuplicate={() => dup.start(t.trip.id)} pinned={pinnedId === t.trip.id} onPin={() => togglePin(t.trip.id)} />
                ))}
              </div>
            </section>
          );
        })}

        {list.length === 0 && (
          <Card className="mx-auto mt-4 max-w-[520px] p-6 text-center">
            <h2 className="sign text-xl">No trips yet</h2>
            <p className="mt-2 text-sm text-muted">
              {me.isAnonymous
                ? 'Open an invite link from a friend, or sign in with Google to plan your own.'
                : 'Start a trip, or add two small sample trips to see how it works.'}
            </p>
            {!me.isAnonymous && (
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button onClick={() => setNewOpen(true)}>New trip</Button>
                <Button
                  variant="secondary"
                  disabled={importing}
                  onClick={async () => {
                    if (importing) return;
                    setImporting(true);
                    await importSampleTrips(me);
                    setImporting(false);
                  }}
                >
                  Add the sample trips
                </Button>
              </div>
            )}
          </Card>
        )}
      </main>

      {dup.ui}
      {importing && <LoadingScreen overlay message="Adding the sample trips, please wait…" />}
      <NewTrip open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => nav(`/t/${id}`)} />
    </div>
  );
}

type S = ReturnType<typeof tripSummary>;

function Hero({ t, s, pinned, onPin }: { t: TripData; s: S; pinned: boolean; onPin: () => void }) {
  const [copied, setCopied] = useState(false);
  const stops = Object.values(t.stops)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((x) => shortPlace(x.place))
    .filter((p, i, arr) => arr.indexOf(p) === i && !/^(pick up|lunch|cj bh)/i.test(p))
    .slice(0, 5);
  const g = t.trip.gas;
  return (
    <section className="mb-5 grid gap-5 rounded-[20px] bg-primary p-5 text-white sm:p-7 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-primary">{STATUS_LABEL[s.status]}</span>
          <span className="opacity-90">
            {dateRange(t.trip.startDate, t.trip.endDate)}
            {g?.carName ? ` · ${g.carName}, ${g.distanceKm} km round trip` : ''}
          </span>
        </div>
        <h2 className="sign mt-3 text-2xl sm:text-4xl">{t.trip.name}</h2>
        {stops.length > 1 && (
          <ol className="mt-4 flex max-w-[560px] items-start" aria-label="Route">
            {stops.map((p, i) => (
              <li key={p} className="flex flex-1 flex-col items-start last:flex-none">
                <div className="flex w-full items-center">
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white ${i === 0 || i === stops.length - 1 ? 'bg-white' : ''}`} />
                  {i < stops.length - 1 && <span className="mx-1.5 h-0.5 flex-1 bg-white/60" />}
                </div>
                <span className="mt-1.5 -translate-x-1 text-xs whitespace-nowrap sm:text-sm">{p}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to={`/t/${t.trip.id}`} className="inline-flex min-h-11 items-center rounded-[10px] bg-white px-4 text-sm font-semibold text-primary">
            Open plan
          </Link>
          <button
            type="button"
            onClick={async () => {
              await copyText(inviteUrl(t));
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-white/70 px-4 text-sm font-semibold"
          >
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <button
            type="button"
            onClick={onPin}
            aria-pressed={pinned}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold ${
              pinned ? 'bg-white/15 hover:bg-white/25' : 'border border-white/70 hover:bg-white/10'
            }`}
          >
            <IconPin width={16} height={16} />
            {pinned ? 'Unpin' : 'Pin to dashboard'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:w-[300px]">
        <div className="col-span-2 rounded-[14px] bg-white p-4 text-ink">
          <div className="text-sm text-muted">You should bring</div>
          <div className="sign tnum text-2xl normal-case text-primary">{peso(s.bring)}</div>
          <div className="text-xs text-muted">Your share: {pesoRange(s.myShare.low, s.myShare.high)}</div>
        </div>
        <div className="rounded-[14px] bg-white/10 p-3.5">
          <div className="sign tnum text-xl normal-case">{Math.abs(s.daysToGo)}</div>
          <div className="text-xs opacity-90">{s.daysToGo >= 0 ? 'days to go' : 'days since it started'}</div>
        </div>
        <div className="rounded-[14px] bg-white/10 p-3.5">
          <div className="sign tnum text-xl normal-case">{pesoShort(s.plan.total.high)}</div>
          <div className="text-xs opacity-90">trip total, at most</div>
        </div>
      </div>
    </section>
  );
}

function Meter({ label, value, pct, note }: { label: string; value: string; pct: number; note: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="sign tnum mt-1 text-xl normal-case">{value}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-tint" role="meter" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted">{note}</div>
    </Card>
  );
}

function Dashboard({ t, s, meUid }: { t: TripData; s: S; meUid: string }) {
  const base = `/t/${t.trip.id}`;
  const names = s.people.map((p) => p.name);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  const attention: { icon: ReactNode; title: string; sub: string; action: string; to: string; warn?: boolean }[] = [];
  for (const c of s.notExact.filter((c) => c.kind !== 'gas')) {
    if (c.certainty.kind === 'estimate')
      attention.push({
        icon: <IconAlert width={18} height={18} />,
        title: `${c.label} ${c.label.endsWith('s') ? 'are' : 'is'} still an estimate`,
        sub: `~${peso(c.certainty.value)}, counted as up to ${peso(Math.round(c.certainty.value * (1 + (c.certainty.marginPct ?? 20) / 100)))} for now`,
        action: 'Update',
        to: base,
        warn: true,
      });
    else if (c.certainty.kind === 'unknown')
      attention.push({
        icon: <IconAlert width={18} height={18} />,
        title: `${c.label} price unknown`,
        sub: c.certainty.max ? `Up to ${peso(c.certainty.max)}${c.note ? `, ${c.note}` : ''}` : 'Left out of totals until there’s a price',
        action: 'Decide',
        to: base,
        warn: true,
      });
  }
  for (const m of s.maybes)
    attention.push({
      icon: <IconUserPlus width={18} height={18} />,
      title: `${m.name} hasn’t said if they’re going`,
      sub: s.maybeDrop > 0 ? `If they join, everyone’s share drops by about ${peso(Math.round(s.maybeDrop / 1000) * 1000)}` : 'Their status is still Maybe',
      action: 'Ask',
      to: `${base}/people`,
    });
  if (s.unassigned.length)
    attention.push({
      icon: <IconBox width={18} height={18} />,
      title: list(s.unassigned.map((i) => i.label)),
      sub: 'No one assigned on the checklist',
      action: 'Assign',
      to: `${base}/checklists`,
    });

  const g = t.trip.gas;
  const notExactNames = s.notExact.map((c) => c.label.toLowerCase());

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Meter
          label="Prices confirmed"
          value={`${s.exactCount} of ${s.costCount}`}
          pct={s.costCount ? s.exactCount / s.costCount : 0}
          note={notExactNames.length ? `${list(notExactNames).replace(/^./, (c) => c.toUpperCase())} ${notExactNames.length === 1 ? 'is' : 'are'} still not exact.` : 'Every price is exact.'}
        />
        <Meter
          label="People"
          value={`${s.going.length} going`}
          pct={s.people.length ? s.going.length / s.people.length : 0}
          note={s.maybes.length ? `${list(s.maybes.map((m) => m.name))} ${s.maybes.length === 1 ? 'is' : 'are'} still a Maybe.` : 'Everyone has answered.'}
        />
        <Meter
          label="Packing list"
          value={`${s.itemsDone} of ${s.itemsTotal}`}
          pct={s.itemsTotal ? s.itemsDone / s.itemsTotal : 0}
          note={s.unassigned.length ? `${s.unassigned.length} ${s.unassigned.length === 1 ? 'item has' : 'items have'} no one assigned.` : 'Everything has someone.'}
        />
        <Meter
          label="Fuel price"
          value={g ? `${pesoExact(g.fuelPrice)}/L` : '—'}
          pct={g ? 1 : 0}
          note={g?.fuelPriceCheckedAt ? `Checked ${shortDate(g.fuelPriceCheckedAt)}.` : 'Not set yet.'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <h2 className="sign text-xl">Needs attention</h2>
          <p className="mb-2 text-sm text-muted">Sort these out and the bring amount stops moving.</p>
          {attention.length === 0 && <p className="py-3 text-sm text-muted">Nothing. Every price is set and everyone has answered.</p>}
          <ul className="divide-y divide-line border-t border-line">
            {attention.map((a) => (
              <li key={a.title} className="flex items-center gap-3 py-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${a.warn ? 'bg-uncertain-tint text-uncertain' : 'bg-primary-tint text-primary'}`}
                >
                  {a.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-xs text-muted">{a.sub}</div>
                </div>
                <Link to={a.to} className="flex min-h-11 items-center px-2 text-sm font-semibold text-primary">
                  {a.action}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="sign mb-3 text-xl">Latest changes</h2>
          <ul className="space-y-3">
            {t.activity.slice(0, 4).map((a) => {
              const who = actor(t, a.actorUid, meUid);
              return (
                <li key={a.id} className="flex gap-3">
                  <Avatar name={who.name === 'You' ? s.mine?.name ?? who.name : who.name} joinOrder={who.joinOrder} size={30} peers={names} />
                  <div className="text-sm">
                    <p>
                      {who.name} {a.summary}
                    </p>
                    <p className="text-xs text-muted">{ago(a.at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to={`${base}/activity`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">
            See all activity
          </Link>
        </Card>
      </div>
    </>
  );
}

function TripCard({
  t,
  s,
  onDuplicate,
  pinned,
  onPin,
}: {
  t: TripData;
  s: S;
  onDuplicate: () => void;
  pinned: boolean;
  onPin: () => void;
}) {
  const settled = s.status === 'settled';
  const note =
    settled || s.spent > 0
      ? s.transfers.length
        ? `${s.paidCount} of ${s.transfers.length} transfers paid`
        : 'All even'
      : s.notExact.length
        ? `${s.notExact.length} ${s.notExact.length === 1 ? 'price' : 'prices'} not exact yet`
        : '';
  return (
    // The whole card opens the trip: the title link stretches over it, and
    // Duplicate sits above that layer so it stays its own button.
    <Card className="relative p-5 transition hover:border-input-border hover:shadow-md focus-within:ring-2 focus-within:ring-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="sign truncate text-xl">
            <Link
              to={`/t/${t.trip.id}${settled ? '/settle' : ''}`}
              className="outline-none after:absolute after:inset-0 after:rounded-[16px] after:content-['']"
            >
              {t.trip.name}
            </Link>
          </h3>
          <div className="text-sm text-muted">
            {dateRange(t.trip.startDate, t.trip.endDate, { weekday: false })} · {settled ? `${s.people.length} people` : `${s.going.length} going`}
          </div>
        </div>
        <Chip tone={statusTone(s.status)}>{STATUS_LABEL[s.status]}</Chip>
      </div>
      <div className="mt-3">
        <div className="text-xs text-muted">{settled || s.spent > 0 ? 'Spent together' : 'Each person, so far'}</div>
        <div className="sign tnum text-xl normal-case">
          {settled || s.spent > 0 ? pesoExact(s.spent) : pesoRange(s.typical.low, s.typical.high)}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className={`text-xs font-semibold ${settled ? 'text-muted' : 'text-uncertain'}`}>{note}</div>
        <div className="relative z-10 flex shrink-0 gap-2">
          <Button
            variant="secondary"
            onClick={onPin}
            aria-pressed={pinned}
            aria-label={pinned ? `Unpin ${t.trip.name}` : `Pin ${t.trip.name} to the dashboard`}
            title={pinned ? 'Unpin from the dashboard' : 'Pin to the dashboard'}
            className={pinned ? 'border-primary bg-primary-tint text-primary' : ''}
          >
            <IconPin width={16} height={16} />
            {pinned ? 'Pinned' : 'Pin'}
          </Button>
          <Button variant="secondary" onClick={onDuplicate}>
            Duplicate
          </Button>
        </div>
      </div>
    </Card>
  );
}
