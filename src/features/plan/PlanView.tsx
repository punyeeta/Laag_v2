import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlan } from '../../data/hooks';
import type { Cost, Stop } from '../../data/types';
import { bringAmount, costBounds } from '../../lib/calc';
import { dayLabel, shortDate, timeLabel } from '../../lib/format';
import { peso, pesoRange } from '../../lib/money';
import { CertaintyChip } from '../../ui/Chip';
import { IconPlus } from '../../ui/icons';
import { OfflineBanner } from '../../ui/misc';
import { useTripCtx } from '../tripContext';
import { CostEditor } from './CostEditor';
import { costLine, gasFormula } from './describe';
import { StopEditor } from './StopEditor';
import { TotalsPanel, typicalShare } from './TotalsPanel';

export function PlanView() {
  const { t, people } = useTripCtx();
  const [includeMaybe, setIncludeMaybe] = useState(false);
  const plan = usePlan(t, includeMaybe)!;
  const [costEdit, setCostEdit] = useState<{ cost?: Cost; stopId?: string | null } | null>(null);
  const [stopEdit, setStopEdit] = useState<{ stop?: Stop } | null>(null);

  const shareOf = useMemo(() => new Map(plan.costs.map((c) => [c.costId, c])), [plan]);
  const stops = useMemo(
    () => Object.values(t.stops).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))),
    [t.stops],
  );
  const days = useMemo(() => {
    const m = new Map<string, Stop[]>();
    for (const s of stops) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m.entries()];
  }, [stops]);
  const costsByStop = useMemo(() => {
    const m = new Map<string | null, Cost[]>();
    for (const c of Object.values(t.costs)) {
      const key = c.stopId && t.stops[c.stopId] ? c.stopId : null;
      m.set(key, [...(m.get(key) ?? []), c]);
    }
    return m;
  }, [t.costs, t.stops]);

  const gas = Object.values(t.costs).find((c) => c.kind === 'gas');
  const wholeTrip = (costsByStop.get(null) ?? []).filter((c) => c.kind !== 'gas');
  const { share } = typicalShare(plan, people, includeMaybe);

  const CostRow = ({ c }: { c: Cost }) => {
    const s = shareOf.get(c.id);
    const b = costBounds(c, t.trip.gas);
    return (
      <li>
        <button
          type="button"
          onClick={() => setCostEdit({ cost: c })}
          className="flex min-h-11 w-full items-center gap-3 rounded-[10px] bg-surface px-3 py-2 text-left hover:ring-1 hover:ring-input-border"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{c.label}</span>
              <CertaintyChip certainty={c.certainty} gas={c.kind === 'gas'} />
              <span className="text-xs text-muted">{costLine(c, s?.people.length ?? 0, t)}</span>
            </span>
          </span>
          <span className={`tnum shrink-0 font-bold ${b.flagged ? 'text-uncertain' : ''}`}>
            {b.flagged ? 'Unknown' : pesoRange(s?.total.low ?? 0, s?.total.high ?? 0)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <OfflineBanner />

        {/* Gas (US-10) */}
        {gas && t.trip.gas && (
          <button
            type="button"
            onClick={() => setCostEdit({ cost: gas })}
            className="mb-5 flex w-full items-center gap-4 rounded-[14px] border border-line bg-surface p-4 text-left hover:ring-1 hover:ring-input-border"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">Whole trip · gas</span>
              <span className="tnum block text-sm font-semibold">{gasFormula(t)}</span>
              <span className="block text-xs text-muted">
                {t.trip.gas.fuelPriceCheckedAt ? `Fuel price checked ${shortDate(t.trip.gas.fuelPriceCheckedAt)} · ` : ''}
                split: {costLine(gas, shareOf.get(gas.id)?.people.length ?? 0, t)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="sign tnum block text-xl normal-case">{peso(shareOf.get(gas.id)?.total.high ?? 0)}</span>
              <span className="tnum block text-xs text-muted">
                {peso(Object.values(shareOf.get(gas.id)?.perPerson ?? {})[0]?.high ?? 0)} each
              </span>
            </span>
          </button>
        )}
        {!t.trip.gas && (
          <div className="mb-5 rounded-[14px] border border-dashed border-input-border p-4 text-sm text-muted">
            No car for this trip yet.{' '}
            <Link to="settings" className="font-semibold text-primary underline">
              Add the distance and car
            </Link>{' '}
            to estimate gas.
          </div>
        )}

        {days.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-input-border p-6 text-center text-muted">
            No stops yet. Add the first place you’re going.
          </div>
        )}

        {days.map(([date, ds]) => (
          <section key={date} className="mb-4">
            <h2 className="mb-1 text-sm font-semibold text-muted">{dayLabel(date)}</h2>
            <ol className="divide-y divide-line border-t border-line">
              {ds.map((s) => {
                const cs = costsByStop.get(s.id) ?? [];
                return (
                  <li key={s.id} className="grid grid-cols-[72px_1fr] gap-3 py-3 sm:grid-cols-[96px_1fr]">
                    <div className="sign tnum pt-0.5 text-lg normal-case sm:text-xl">{timeLabel(s.time) || '—'}</div>
                    <div className="min-w-0">
                      <button type="button" onClick={() => setStopEdit({ stop: s })} className="block text-left hover:underline">
                        <span className="block text-lg font-semibold">{s.place}</span>
                        {s.note && <span className="block text-sm text-muted">{s.note}</span>}
                      </button>
                      {cs.length > 0 && (
                        <ul className="mt-2 space-y-2">
                          {cs.map((c) => (
                            <CostRow key={c.id} c={c} />
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => setCostEdit({ stopId: s.id })}
                        className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
                      >
                        <IconPlus width={16} height={16} /> Add cost
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {wholeTrip.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-semibold text-muted">Whole trip</h2>
            <ul className="space-y-2">
              {wholeTrip.map((c) => (
                <CostRow key={c.id} c={c} />
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setStopEdit({})}
            className="min-h-11 rounded-[10px] border border-dashed border-input-border px-4 text-sm font-semibold text-primary hover:bg-primary-tint"
          >
            Add stop
          </button>
          <button
            type="button"
            onClick={() => setCostEdit({ stopId: null })}
            className="min-h-11 rounded-[10px] border border-dashed border-input-border px-4 text-sm font-semibold text-primary hover:bg-primary-tint"
          >
            Add a whole-trip cost
          </button>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-[120px]">
          <TotalsPanel t={t} plan={plan} people={people} includeMaybe={includeMaybe} setIncludeMaybe={setIncludeMaybe} />
        </div>
      </aside>

      {/* Phone: the full panel at the end, plus a sticky totals bar. */}
      <div className="lg:hidden">
        <TotalsPanel t={t} plan={plan} people={people} includeMaybe={includeMaybe} setIncludeMaybe={setIncludeMaybe} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 py-2.5 pr-[190px] pl-4 backdrop-blur lg:hidden">
        <div className="text-xs text-muted">Each person</div>
        <div className="tnum truncate text-base font-bold">{pesoRange(share.low, share.high)}</div>
        <div className="text-xs text-primary">Bring {peso(bringAmount(share.high))}</div>
      </div>

      <CostEditor
        open={!!costEdit}
        onClose={() => setCostEdit(null)}
        t={t}
        people={people}
        cost={costEdit?.cost}
        defaultStopId={costEdit?.stopId}
      />
      <StopEditor open={!!stopEdit} onClose={() => setStopEdit(null)} t={t} stop={stopEdit?.stop} />
    </div>
  );
}
