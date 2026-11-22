import { useState } from 'react';
import { useSettlement } from '../../data/hooks';
import { newId, update, write } from '../../data/repo';
import type { Payment, Trip } from '../../data/types';
import { POOL, resolveSplit } from '../../lib/calc';
import { dateRange } from '../../lib/format';
import { pesoExact } from '../../lib/money';
import { Button } from '../../ui/Button';
import { OfflineBanner, ScreenTitle, Stat } from '../../ui/misc';
import { copyText } from '../people/invite';
import { personName, useTripCtx } from '../tripContext';

const fmtDay = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function SettleView() {
  const { t, people, isOrganizer } = useTripCtx();
  const s = useSettlement(t)!;
  const [copied, setCopied] = useState(false);
  const name = (id: string) => (id === POOL ? 'The pool' : t.people[id]?.name ?? '?');

  const fronted = Object.values(t.expenses).filter((e) => e.paidBy !== POOL).sort((a, b) => a.createdAt - b.createdAt);
  const frontedTotal = fronted.reduce((a, e) => a + e.amount, 0);
  const allSplitBy = fronted.length > 0 && fronted.every((e) => e.split.kind === 'allGoing');
  const n = resolveSplit({ kind: 'allGoing' }, people).length;
  const allPaid = s.transfers.length > 0 && s.transfers.every((x) => x.paid);

  function markPaid(from: string, to: string, amount: number) {
    const p: Payment = { id: newId(), from, to, amount, paidAt: Date.now() };
    write(t.trip.id, 'payments', p.id, p, `marked ${name(from)} → ${name(to)} ${pesoExact(amount)} as paid`);
  }
  function unmark(id: string) {
    const p = t.payments[id];
    write(t.trip.id, 'payments', id, null, `marked ${name(p.from)} → ${name(p.to)} as not paid`);
  }

  function why(from: string, amount: number): string {
    const paid = s.balances.paid[from] ?? 0;
    const contrib = Object.values(t.contributions)
      .filter((c) => c.person === from)
      .reduce((a, c) => a + c.amount, 0);
    const frontedByThem = paid - contrib;
    if (frontedByThem > 0) return `${pesoExact(amount + frontedByThem)} share minus the ${pesoExact(frontedByThem)} they fronted`;
    return contrib > 0 ? 'Share of fronted costs' : 'Their share';
  }

  const summary = [
    `${t.trip.name}: settle up`,
    `Total spent ${pesoExact(s.spent)}${s.fromPool ? `, ${pesoExact(s.fromPool)} from the pool` : ''}.`,
    ...s.transfers.map((x) => `${name(x.from)} → ${name(x.to)}: ${pesoExact(x.amount)}${x.paid ? ' (paid)' : ''}`),
  ].join('\n');

  return (
    <div className="mx-auto max-w-[640px]">
      <OfflineBanner />
      <ScreenTitle eyebrow={`${t.trip.name} · ${dateRange(t.trip.startDate, t.trip.endDate, { weekday: false, year: false })}`} title="Settle up" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Total spent" value={pesoExact(s.spent)} />
        <Stat label="From the pool" value={pesoExact(s.fromPool)} />
      </div>

      {fronted.length > 0 && (
        <div className="mb-5 rounded-[16px] border border-line p-4">
          <div className="mb-2 font-semibold">Fronted by people · {pesoExact(frontedTotal)}</div>
          <ul className="space-y-1 text-sm">
            {fronted.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="truncate">
                  {personName(t, e.paidBy)} · {e.label}
                </span>
                <span className="tnum font-semibold">{pesoExact(e.amount)}</span>
              </li>
            ))}
          </ul>
          {allSplitBy && n > 0 && (
            <p className="mt-2 text-xs text-muted">
              Split by {n}: {pesoExact(Math.floor(frontedTotal / n))}–{pesoExact(Math.ceil(frontedTotal / n))} each, to the centavo
            </p>
          )}
        </div>
      )}

      <h2 className="mb-2 font-semibold">
        {s.transfers.length === 0
          ? 'Everyone is even. Nothing to settle.'
          : `${s.transfers.length} transfer${s.transfers.length === 1 ? '' : 's'} settle${s.transfers.length === 1 ? 's' : ''} everything`}
      </h2>
      <ul className="divide-y divide-line">
        {s.transfers.map((x) => (
          <li key={`${x.from}-${x.to}`} className="flex min-h-15 items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${x.paid ? 'text-muted' : ''}`}>
                {name(x.from)} → {name(x.to)}
              </div>
              <div className="text-xs text-muted">
                {x.paid ? `Paid ${fmtDay(x.paid.paidAt)}${x.paid.note ? ` ${x.paid.note}` : ''}` : why(x.from, x.amount)}
              </div>
            </div>
            <div className={`tnum font-bold ${x.paid ? 'text-muted' : ''}`}>{pesoExact(x.amount)}</div>
            {x.paid ? (
              <button
                type="button"
                onClick={() => unmark(x.paid!.id)}
                className="min-h-11 min-w-[92px] rounded-full bg-primary-tint px-3 text-sm font-semibold text-primary"
                aria-label={`Paid. Tap to mark ${name(x.from)} as not paid`}
              >
                Paid
              </button>
            ) : (
              <button
                type="button"
                onClick={() => markPaid(x.from, x.to, x.amount)}
                className="min-h-11 min-w-[92px] rounded-full border border-ink px-3 text-sm font-semibold"
              >
                Mark paid
              </button>
            )}
          </li>
        ))}
      </ul>

      {allPaid && t.trip.status !== 'settled' && isOrganizer && (
        <div className="mt-4 rounded-[14px] bg-success-tint p-4 text-success">
          <p className="mb-2 font-semibold">Every transfer is paid.</p>
          <Button onClick={() => update<Trip>(t.trip.id, 'trip', t.trip.id, { status: 'settled' }, 'marked the trip as settled')}>
            Mark trip as settled
          </Button>
        </div>
      )}

      <Button
        size="lg"
        block
        className="mt-6"
        onClick={async () => {
          await copyText(summary);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? 'Copied' : 'Copy summary for the GC'}
      </Button>
    </div>
  );
}
