import type { Cost, TripData } from '../../data/types';
import { costBounds, gasLiters, groupCount, type Bounds } from '../../lib/calc';
import { peso, pesoExact, pesoRange } from '../../lib/money';

export function boundsText(b: Bounds) {
  return pesoRange(b.low, b.high);
}

/** Short line under a cost: "shared · 6", "₱300 per 5 visitors → 2 groups", ... */
export function costLine(c: Cost, inSplit: number, t: TripData): string {
  const b = costBounds(c, t.trip.gas);
  const unit = b.flagged ? 'unknown' : boundsText(b);
  let s: string;
  const basis = c.costType === 'optional' ? c.optionalBasis ?? 'perPerson' : c.costType;
  if (c.costType === 'optional') s = `optional · ${inSplit} in`;
  else if (basis === 'perPerson') s = `per person · ${unit}`;
  else if (basis === 'perGroup') {
    const g = groupCount(inSplit, c.groupSize ?? 1);
    s = `${unit} per ${c.groupSize ?? 1} visitors → ${g} group${g === 1 ? '' : 's'}`;
  } else s = `shared · ${inSplit}`;
  if (c.split.kind === 'only' && c.note) return c.note;
  return c.note ? `${s} · ${c.note}` : s;
}

/** For the activity log: how a price reads before and after an edit. */
export function priceText(c: Cost, t: TripData): string {
  const b = costBounds(c, t.trip.gas);
  if (b.flagged) return 'unknown';
  if (c.certainty.kind === 'estimate') return `~${peso(c.certainty.value)}`;
  return boundsText(b);
}

export function gasFormula(t: TripData): string | null {
  const g = t.trip.gas;
  if (!g) return null;
  const liters = gasLiters(g);
  const car = g.carName ? ` (${g.carName}${g.fuelType ? `, ${g.fuelType}` : ''})` : '';
  return `${g.distanceKm} km ÷ ${g.kmPerL} km/L${car} × ${(1 + g.bufferPct / 100).toFixed(2)} buffer = ${liters.toFixed(1)} L × ${pesoExact(g.fuelPrice)}/L`;
}
