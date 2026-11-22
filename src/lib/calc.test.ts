// TC-01 to TC-17 from Phase 2. Amounts in the spec are pesos; tests use centavos.
import { describe, expect, it } from 'vitest';
import {
  allocate,
  balances,
  bringAmount,
  costBounds,
  costTotal,
  gasCost,
  gasLiters,
  parseAmount,
  planShares,
  POOL,
  resolveSplit,
  settle,
  type CostInput,
  type GasSettings,
  type PersonRef,
} from './calc';

const ids = ['organizer', 'guest1', 'guest2', 'guest3', 'guest4', 'guest5', 'guest6'] as const;
const people: PersonRef[] = ids.map((id, i) => ({
  id,
  joinOrder: i,
  status: id === 'guest6' ? 'maybe' : 'going',
}));
const going = people.filter((p) => p.status === 'going');

const gas: GasSettings = { distanceKm: 290, kmPerL: 14, bufferPct: 10, fuelPrice: 9522 };

let n = 0;
const cost = (c: Partial<CostInput>): CostInput => ({
  id: `c${n++}`,
  kind: 'normal',
  certainty: { kind: 'exact', value: 0 },
  costType: 'shared',
  split: { kind: 'allGoing' },
  ...c,
});

const guide = cost({ certainty: { kind: 'exact', value: 30000 }, costType: 'perGroup', groupSize: 5 });

// The sample trip for TC-15 and TC-16.
const sampleTrip: CostInput[] = [
  cost({ certainty: { kind: 'exact', value: 300000 }, split: { kind: 'only', people: ['guest1'] } }),
  cost({ kind: 'gas', split: { kind: 'allGoingExcept', people: ['guest1'] } }),
  cost({ certainty: { kind: 'exact', value: 18000 } }),
  cost({ certainty: { kind: 'estimate', value: 100000 } }),
  guide,
  cost({ certainty: { kind: 'exact', value: 10000 }, costType: 'perPerson' }),
  cost({
    certainty: { kind: 'exact', value: 5000 },
    costType: 'optional',
    optionalBasis: 'perPerson',
    split: { kind: 'allGoingExcept', people: ['guest5'] },
  }),
  cost({ certainty: { kind: 'exact', value: 30000 }, costType: 'perPerson' }),
  cost({ certainty: { kind: 'unknown', max: 15000 } }),
  cost({ certainty: { kind: 'range', low: 3000, high: 5000 } }),
];

describe('parseAmount', () => {
  it('TC-01: "50*5" is 250.00', () => {
    expect(parseAmount('50*5')).toEqual({ ok: true, value: 25000 });
  });
  it('TC-02: "4500/4" is 1,125.00', () => {
    expect(parseAmount('4500/4')).toEqual({ ok: true, value: 112500 });
  });
  it.each(['50*', 'abc', '10/0', '0', ''])('TC-03: "%s" is an error', (t) => {
    expect(parseAmount(t).ok).toBe(false);
  });
  it('handles parentheses and decimals', () => {
    expect(parseAmount('(1000 + 307.45)')).toEqual({ ok: true, value: 130745 });
  });
});

describe('costTotal', () => {
  it('TC-04: guide ₱300 per 5 visitors, 6 people is 600.00 (2 groups)', () => {
    expect(costTotal(guide, 6)).toEqual({ low: 60000, high: 60000 });
  });
  it('TC-05: guide ₱300 per 5 visitors, 5 people is 300.00 (1 group)', () => {
    expect(costTotal(guide, 5)).toEqual({ low: 30000, high: 30000 });
  });
  it('TC-08: life vest ₱50 per person, everyone except Guest 5, 6 Going is 250.00; Guest 5 pays 0', () => {
    const vest = sampleTrip[6];
    const split = resolveSplit(vest.split, people);
    expect(costTotal(vest, split.length)).toEqual({ low: 25000, high: 25000 });
    const shares = planShares(people, [vest], gas);
    expect(shares.perPerson.guest5).toEqual({ low: 0, high: 0 });
  });
});

describe('allocate', () => {
  it('TC-06: ₱600 among 7 is 85.72 for the first three, 85.71 for the other four', () => {
    expect(Object.values(allocate(60000, [...ids]))).toEqual([8572, 8572, 8572, 8571, 8571, 8571, 8571]);
  });
  it('TC-07: ₱100 among 3 is 33.34, 33.33, 33.33', () => {
    expect(Object.values(allocate(10000, ['a', 'b', 'c']))).toEqual([3334, 3333, 3333]);
  });
});

describe('resolveSplit', () => {
  it('TC-09: allGoingExcept Guest 1, 6 Going', () => {
    const r = resolveSplit({ kind: 'allGoingExcept', people: ['guest1'] }, people);
    expect(r.map((p) => p.id)).toEqual(['organizer', 'guest2', 'guest3', 'guest4', 'guest5']);
  });
  it('TC-10: allGoing with Guest 6 as Maybe is 6, then 7 with includeMaybe', () => {
    expect(resolveSplit({ kind: 'allGoing' }, people, false)).toHaveLength(6);
    expect(resolveSplit({ kind: 'allGoing' }, people, true)).toHaveLength(7);
  });
});

describe('costBounds', () => {
  it('TC-11: estimate ₱1,000, margin 20 is 1,000.00 to 1,200.00', () => {
    const c = cost({ certainty: { kind: 'estimate', value: 100000, marginPct: 20 } });
    expect(costBounds(c)).toMatchObject({ low: 100000, high: 120000 });
  });
  it('TC-12: unknown with max ₱150 is 0 to 150.00; with no max it is left out and flagged', () => {
    expect(costBounds(cost({ certainty: { kind: 'unknown', max: 15000 } }))).toEqual({
      low: 0,
      high: 15000,
      flagged: false,
    });
    const noMax = cost({ certainty: { kind: 'unknown' } });
    expect(costBounds(noMax).flagged).toBe(true);
    const s = planShares(going, [noMax], gas);
    expect(s.total).toEqual({ low: 0, high: 0 });
    expect(s.flagged).toBe(1);
  });
});

describe('gasCost', () => {
  it('TC-13: 290 km, 14 km/L, 10% buffer, ₱95.22/L is 2,169.66 (22.79 L)', () => {
    expect(gasLiters(gas)).toBeCloseTo(22.79, 2);
    expect(gasCost(gas)).toBe(216966);
  });
});

describe('bringAmount', () => {
  it('TC-14: 1,247.28 and 1,250.00 both bring 1,250', () => {
    expect(bringAmount(124728)).toBe(125000);
    expect(bringAmount(125000)).toBe(125000);
  });
});

describe('planShares', () => {
  it('TC-15: sample trip, Going only', () => {
    const s = planShares(people, sampleTrip, gas, false);
    expect(s.perPerson.organizer).toEqual({ low: 118561, high: 124728 });
    expect(s.perPerson.guest1).toEqual({ low: 375167, high: 381334 });
    expect(s.perPerson.guest5).toEqual({ low: 113559, high: 119726 });
    expect(s.total).toEqual({ low: 962966, high: 999966 });
    expect(s.nonExact).toBe(4);
  });
  it('TC-16: same, with Guest 6 joining', () => {
    const s = planShares(people, sampleTrip, gas, true);
    expect(s.perPerson.organizer).toEqual({ low: 107020, high: 112306 });
    expect(s.total).toEqual({ low: 1007966, high: 1044966 });
  });
  it('shares always add up to the total (BR-08)', () => {
    const s = planShares(people, sampleTrip, gas, true);
    const sum = Object.values(s.perPerson).reduce((a, b) => ({ low: a.low + b.low, high: a.high + b.high }));
    expect(sum).toEqual(s.total);
  });
});

describe('settle', () => {
  it('TC-17: Bukidnon Road Trip fronted costs', () => {
    const six = people.filter((p) => p.id !== 'guest6');
    const b = balances(
      [
        { amount: 130745, paidBy: 'organizer', split: { kind: 'allGoing' } },
        { amount: 9745, paidBy: 'guest2', split: { kind: 'allGoing' } },
      ],
      [],
      six,
    );
    const t = settle(b, six);
    expect(t).toEqual([
      { from: 'guest1', to: 'organizer', amount: 23415 },
      { from: 'guest3', to: 'organizer', amount: 23415 },
      { from: 'guest4', to: 'organizer', amount: 23415 },
      { from: 'guest5', to: 'organizer', amount: 23414 },
      { from: 'guest2', to: 'organizer', amount: 13670 },
    ]);
    expect(t.reduce((a, x) => a + x.amount, 0)).toBe(107329);
  });
  it('pool contributions credit the giver and the pool settles to zero (BR-11)', () => {
    const two: PersonRef[] = [
      { id: 'a', joinOrder: 0, status: 'going' },
      { id: 'b', joinOrder: 1, status: 'going' },
    ];
    const b = balances(
      [{ amount: 1000, paidBy: POOL, split: { kind: 'allGoing' } }],
      [
        { person: 'a', amount: 1000 },
        { person: 'b', amount: 0 },
      ],
      two,
    );
    expect(b.pool).toBe(0);
    expect(settle(b, two)).toEqual([{ from: 'b', to: 'a', amount: 500 }]);
  });
});
