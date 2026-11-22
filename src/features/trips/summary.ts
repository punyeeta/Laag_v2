// Per-trip numbers for the dashboard, all derived from calc.ts.
import { effectiveStatus, todayISO } from '../../data/hooks';
import type { TripData } from '../../data/types';
import { balances, bringAmount, costBounds, isExact, planShares, settle } from '../../lib/calc';
import { daysBetween } from '../../lib/format';
import { typicalShare } from '../plan/TotalsPanel';

export function tripSummary(t: TripData, meUid: string) {
  const people = Object.values(t.people).sort((a, b) => a.joinOrder - b.joinOrder);
  const costs = Object.values(t.costs);
  const plan = planShares(people, costs, t.trip.gas, false);
  const planMaybe = planShares(people, costs, t.trip.gas, true);
  const mine = people.find((p) => p.claimedBy === meUid);
  const myShare = mine ? plan.perPerson[mine.id] : typicalShare(plan, people, false).share;
  const typical = typicalShare(plan, people, false).share;
  const typicalMaybe = typicalShare(planMaybe, people, true).share;

  const b = balances(Object.values(t.expenses), Object.values(t.contributions), people);
  const transfers = settle(b, people);
  const paidCount = transfers.filter((tr) =>
    Object.values(t.payments).some((p) => p.from === tr.from && p.to === tr.to && p.amount === tr.amount),
  ).length;
  const spent = Object.values(t.expenses).reduce((a, e) => a + e.amount, 0);

  const items = Object.values(t.checklist);
  const status = effectiveStatus(t.trip);
  return {
    status,
    people,
    going: people.filter((p) => p.status === 'going'),
    maybes: people.filter((p) => p.status === 'maybe'),
    plan,
    mine,
    myShare,
    bring: bringAmount(myShare.high),
    typical,
    maybeDrop: Math.max(0, typical.high - typicalMaybe.high),
    exactCount: costs.filter(isExact).length,
    costCount: costs.length,
    notExact: costs.filter((c) => !isExact(c)),
    unknownNoMax: costs.filter((c) => costBounds(c, t.trip.gas).flagged),
    itemsDone: items.filter((i) => i.done).length,
    itemsTotal: items.length,
    unassigned: items.filter((i) => !i.assignee),
    daysToGo: daysBetween(todayISO(), t.trip.startDate),
    spent,
    transfers,
    paidCount,
  };
}
