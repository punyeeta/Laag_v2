import type { Person, TripData } from '../../data/types';
import { bringAmount, type Bounds, type PlanShares } from '../../lib/calc';
import { peso, pesoRange } from '../../lib/money';

/** Leftover centavos make shares differ by ₱0.01; compare at the peso (BR-08). */
const pesoKey = (b: Bounds) => `${Math.round(b.low / 100)}:${Math.round(b.high / 100)}`;

/** The share most of the group has, so the panel can talk about "each person". */
export function typicalShare(plan: PlanShares, people: Person[], includeMaybe: boolean) {
  const inTrip = people.filter((p) => p.status === 'going' || (includeMaybe && p.status === 'maybe'));
  const counts = new Map<string, { b: Bounds; n: number; first: Person }>();
  for (const p of inTrip) {
    const b = plan.perPerson[p.id];
    const k = pesoKey(b);
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { b, n: 1, first: p });
  }
  let best: { b: Bounds; n: number; first: Person } | null = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return { share: best?.b ?? { low: 0, high: 0 }, person: best?.first, inTrip };
}

export function categoryBreakdown(t: TripData, plan: PlanShares, personId: string | undefined) {
  const out = new Map<string, Bounds>();
  if (!personId) return [];
  for (const cs of plan.costs) {
    const share = cs.perPerson[personId];
    if (!share || (share.low === 0 && share.high === 0)) continue;
    const cat = t.costs[cs.costId]?.category || 'Other';
    const cur = out.get(cat) ?? { low: 0, high: 0 };
    out.set(cat, { low: cur.low + share.low, high: cur.high + share.high });
  }
  return [...out.entries()].sort((a, b) => b[1].high - a[1].high);
}

export function TotalsPanel({
  t,
  plan,
  people,
  includeMaybe,
  setIncludeMaybe,
}: {
  t: TripData;
  plan: PlanShares;
  people: Person[];
  includeMaybe: boolean;
  setIncludeMaybe: (v: boolean) => void;
}) {
  const { share, person, inTrip } = typicalShare(plan, people, includeMaybe);
  const cats = categoryBreakdown(t, plan, person?.id);
  const max = Math.max(1, ...cats.map(([, b]) => b.high));
  const odd = inTrip.filter((p) => pesoKey(plan.perPerson[p.id]) !== pesoKey(share));
  const maybes = people.filter((p) => p.status === 'maybe');
  const goingCount = people.filter((p) => p.status === 'going').length;

  return (
    <div className="rounded-[16px] border border-line bg-paper p-5">
      <div className="text-sm text-muted">Each person (most of the group)</div>
      <div className="sign tnum mt-1 text-2xl normal-case leading-none">{pesoRange(share.low, share.high)}</div>
      {plan.nonExact > 0 && (
        <div className="mt-2 text-sm font-semibold text-uncertain">
          {plan.nonExact} {plan.nonExact === 1 ? 'price' : 'prices'} not exact yet
          {plan.flagged > 0 && ` · ${plan.flagged} left out (no maximum)`}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between rounded-[12px] bg-primary-tint px-4 py-3 text-primary">
        <span className="text-sm font-semibold">Tell everyone to bring</span>
        <span className="tnum text-lg font-bold">{peso(bringAmount(share.high))}</span>
      </div>

      {cats.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold">Where each share goes</div>
          <ul className="space-y-2">
            {cats.map(([cat, b]) => (
              <li key={cat} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-muted">{cat}</span>
                <span className="h-2 overflow-hidden rounded-full bg-primary-tint">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(b.high / max) * 100}%` }} />
                </span>
                <span className="tnum text-right">{pesoRange(b.low, b.high)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Trip total</dt>
          <dd className="tnum font-semibold">{pesoRange(plan.total.low, plan.total.high)}</dd>
        </div>
        {odd.map((p) => (
          <div key={p.id} className="flex justify-between gap-3">
            <dt className="truncate text-muted">
              {p.name}
              {p.note ? ` (${p.note.toLowerCase()})` : ''}
            </dt>
            <dd className="tnum font-semibold">{pesoRange(plan.perPerson[p.id].low, plan.perPerson[p.id].high)}</dd>
          </div>
        ))}
      </dl>

      {maybes.length > 0 && (
        <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-line p-3">
          <span>
            <span className="block text-sm font-semibold">
              What if {maybes.map((m) => m.name).join(' and ')} {maybes.length === 1 ? 'joins' : 'join'}?
            </span>
            <span className="block text-xs text-muted">
              {includeMaybe ? `Showing shares with Maybes counted (${inTrip.length}). Nothing is saved.` : `Totals count Going only (${goingCount}).`}
            </span>
          </span>
          <input
            type="checkbox"
            checked={includeMaybe}
            onChange={(e) => setIncludeMaybe(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[var(--primary)]"
          />
        </label>
      )}
    </div>
  );
}
