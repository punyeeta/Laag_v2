// Live reads. Raw entities come from the store; every number is derived from
// calc.ts with useMemo (Phase 3: no global state library).
import { useEffect, useMemo, useState } from 'react';
import {
  balances,
  bringAmount,
  byJoinOrder,
  planShares,
  settle,
  type Balances,
  type PlanShares,
  type Transfer,
} from '../lib/calc';
import { useStore } from './store';
import type { Person, Trip, TripData, TripStatus } from './types';

export const useMe = () => useStore((s) => s.me);
export const useTrips = () => useStore((s) => s.trips);
export const useTripData = (id: string | undefined) => useStore((s) => (id ? s.trips[id] : undefined));
export const usePendingWrites = () => useStore((s) => s.pendingWrites);
export const useCars = () => useStore((s) => s.cars);

export function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** US-03: with statusMode auto, a planning trip moves to Ongoing on its start date. */
export function effectiveStatus(trip: Trip, today = todayISO()): TripStatus {
  if (trip.status === 'planning' && trip.statusMode === 'auto' && today >= trip.startDate) return 'ongoing';
  return trip.status;
}

export function sortedPeople(t: TripData): Person[] {
  return Object.values(t.people).sort(byJoinOrder);
}

export function myPerson(t: TripData, uid: string): Person | undefined {
  return Object.values(t.people).find((p) => p.claimedBy === uid);
}

export function usePeople(t: TripData | undefined) {
  return useMemo(() => (t ? sortedPeople(t) : []), [t?.people]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function usePlan(t: TripData | undefined, includeMaybe: boolean): PlanShares | null {
  return useMemo(() => {
    if (!t) return null;
    return planShares(Object.values(t.people), Object.values(t.costs), t.trip.gas, includeMaybe);
  }, [t?.people, t?.costs, t?.trip.gas, includeMaybe]); // eslint-disable-line react-hooks/exhaustive-deps
}

export interface Settlement {
  balances: Balances;
  transfers: (Transfer & { paid?: { paidAt: number; note?: string; id: string } })[];
  spent: number;
  fromPool: number;
  fronted: number;
}

/**
 * Settle up (US-15). Payments already marked paid count as money moved, so the
 * list keeps showing them as Paid next to what is still open.
 */
export function useSettlement(t: TripData | undefined): Settlement | null {
  return useMemo(() => {
    if (!t) return null;
    const ps = Object.values(t.people);
    const ex = Object.values(t.expenses);
    const b = balances(ex, Object.values(t.contributions), ps);
    const transfers = settle(b, ps).map((tr) => ({ ...tr })) as Settlement['transfers'];
    // Match recorded payments to suggested transfers.
    const unmatched = [...Object.values(t.payments)];
    for (const tr of transfers) {
      const i = unmatched.findIndex((p) => p.from === tr.from && p.to === tr.to && p.amount === tr.amount);
      if (i >= 0) {
        const p = unmatched.splice(i, 1)[0];
        tr.paid = { paidAt: p.paidAt, note: p.note, id: p.id };
      }
    }
    const spent = ex.reduce((a, e) => a + e.amount, 0);
    const fromPool = ex.filter((e) => e.paidBy === 'pool').reduce((a, e) => a + e.amount, 0);
    return { balances: b, transfers, spent, fromPool, fronted: spent - fromPool };
  }, [t?.people, t?.expenses, t?.contributions, t?.payments]); // eslint-disable-line react-hooks/exhaustive-deps
}

export { bringAmount };
