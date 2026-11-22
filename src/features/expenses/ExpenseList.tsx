import { useMemo, useState } from 'react';
import { useSettlement } from '../../data/hooks';
import type { Expense } from '../../data/types';
import { POOL, resolveSplit } from '../../lib/calc';
import { dateRange, dayLabel } from '../../lib/format';
import { pesoExact } from '../../lib/money';
import { Avatar } from '../../ui/Avatar';
import { IconClock } from '../../ui/icons';
import { OfflineBanner, ScreenTitle, Stat } from '../../ui/misc';
import { Segmented } from '../../ui/Segmented';
import { personName, useTripCtx } from '../tripContext';
import { QuickAdd } from './QuickAdd';

export function ExpenseList() {
  const { t, people, me, mine } = useTripCtx();
  const s = useSettlement(t)!;
  const [filter, setFilter] = useState<'all' | 'mine' | 'pool'>('all');
  const [editing, setEditing] = useState<Expense | undefined>();
  const names = people.map((p) => p.name);

  const groups = useMemo(() => {
    const xs = Object.values(t.expenses)
      .filter((e) => (filter === 'mine' ? e.paidBy === mine?.id : filter === 'pool' ? e.paidBy === POOL : true))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const m = new Map<string, Expense[]>();
    for (const e of xs) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [t.expenses, filter, mine?.id]);

  const contributed = Object.values(t.contributions).reduce((a, c) => a + c.amount, 0);

  return (
    <div className="mx-auto max-w-[640px]">
      <ScreenTitle title="Expenses" sub={`${t.trip.name} · ${dateRange(t.trip.startDate, t.trip.endDate, { weekday: false, year: false })}`} />
      <OfflineBanner />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Spent" value={pesoExact(s.spent)} />
        <Stat label="From the pool" value={pesoExact(s.fromPool)}>
          {contributed > 0 && <div className="mt-1 text-xs text-muted">{pesoExact(contributed)} put in</div>}
        </Stat>
      </div>

      <div className="mb-4">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'Mine' },
            { value: 'pool', label: 'Pool' },
          ]}
        />
      </div>

      {groups.length === 0 && (
        <p className="rounded-[14px] border border-dashed border-input-border p-6 text-center text-muted">
          Nothing logged yet. Tap Add expense when someone pays for something.
        </p>
      )}

      {groups.map(([date, xs]) => (
        <section key={date} className="mb-3">
          <h2 className="mb-1 text-sm font-semibold text-muted">{dayLabel(date)}</h2>
          <ul className="divide-y divide-line border-b border-line">
            {xs.map((e) => {
              const n = resolveSplit(e.split, people).length;
              const payer = e.paidBy === POOL ? null : t.people[e.paidBy];
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => setEditing(e)} className="flex min-h-15 w-full items-center gap-3 py-2 text-left">
                    {payer ? (
                      <Avatar name={payer.name} joinOrder={payer.joinOrder} peers={names} />
                    ) : (
                      <span className="sign flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-primary" aria-hidden>
                        ₱
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{e.label}</span>
                      <span className="block truncate text-xs text-muted">
                        {payer ? `Paid by ${personName(t, e.paidBy, me.uid)}` : 'From the pool'} ·{' '}
                        {e.split.kind === 'allGoing' ? `split by ${n}` : `${n} ${n === 1 ? 'person' : 'people'}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="tnum block font-bold">{pesoExact(e.amount)}</span>
                      {e.pending && (
                        <span className="flex items-center justify-end gap-1 text-xs font-semibold text-uncertain">
                          <IconClock width={14} height={14} /> Waiting to sync
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <QuickAdd open={!!editing} onClose={() => setEditing(undefined)} t={t} me={me} people={people} initial={editing} />
    </div>
  );
}
