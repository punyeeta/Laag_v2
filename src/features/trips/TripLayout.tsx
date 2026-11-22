import { useCallback, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { myPerson, useMe, usePeople, useTripData } from '../../data/hooks';
import { dateRange } from '../../lib/format';
import { AvatarStack } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { IconPlus } from '../../ui/icons';
import { Logo } from '../../ui/misc';
import { QuickAdd } from '../expenses/QuickAdd';
import type { TripCtx } from '../tripContext';
import { CopyInviteButton } from '../people/invite';
import { useStore } from '../../data/store';
import { LoadingScreen } from '../auth/AuthScreens';

const tabs = [
  { to: '', label: 'Plan', end: true },
  { to: 'people', label: 'People' },
  { to: 'checklists', label: 'Checklists' },
  { to: 'notes', label: 'Notes' },
  { to: 'expenses', label: 'Expenses' },
  { to: 'settle', label: 'Settle up' },
  { to: 'activity', label: 'Activity' },
  { to: 'settings', label: 'Settings' },
];

export function TripLayout() {
  const { tripId } = useParams();
  const t = useTripData(tripId);
  const me = useMe();
  const people = usePeople(t);
  const memberOf = useStore((s) => s.memberOf);
  const [quickAdd, setQuickAdd] = useState(false);
  const openQuickAdd = useCallback(() => setQuickAdd(true), []);

  const ctx = useMemo<TripCtx | null>(
    () =>
      t
        ? {
            t,
            me,
            people,
            mine: myPerson(t, me.uid),
            isOrganizer: t.trip.organizerUid === me.uid,
            openQuickAdd,
          }
        : null,
    [t, me, people, openQuickAdd],
  );

  if (!t || !ctx) {
    if (tripId && memberOf.includes(tripId)) return <LoadingScreen />;
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="mb-4">This trip doesn’t exist, or it was deleted.</p>
        <Link to="/" className="font-semibold text-primary underline">
          Back to your trips
        </Link>
      </div>
    );
  }

  const going = people.filter((p) => p.status === 'going');

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 pt-3 sm:px-6">
          <Link to="/" className="shrink-0" aria-label="All trips">
            <Logo size={36} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <Link to="/" className="hidden text-sm font-semibold text-primary sm:inline">
                Trips /
              </Link>
              <h1 className="sign truncate text-lg sm:text-xl">{t.trip.name}</h1>
            </div>
            <div className="truncate text-xs text-muted">{dateRange(t.trip.startDate, t.trip.endDate)}</div>
          </div>
          <div className="hidden md:block">
            <AvatarStack people={going} />
          </div>
          <div className="hidden sm:block">
            <CopyInviteButton t={t} compact />
          </div>
        </div>
        <nav aria-label="Trip sections" className="no-scrollbar mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-2 sm:px-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.label}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition ${
                  isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-5 pb-32 sm:px-6">
        <Outlet context={ctx} />
      </main>

      {/* Quick-add, reachable with one thumb from any trip screen (US-13). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button size="lg" className="pointer-events-auto rounded-full px-6 shadow-lg" onClick={openQuickAdd}>
          <IconPlus /> Add expense
        </Button>
      </div>
      <QuickAdd open={quickAdd} onClose={() => setQuickAdd(false)} t={t} me={me} people={people} />
    </div>
  );
}
