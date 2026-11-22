// Pure calculation functions (Phase 2). No Firebase or React in here, so each
// one can be tested on its own. All money is whole centavos.
import type { Centavos } from './money';

export type PersonStatus = 'going' | 'maybe' | 'out';

export interface PersonRef {
  id: string;
  status: PersonStatus;
  /** Fixes the order for leftover centavos and ties (BR-08, BR-10). */
  joinOrder: number;
}

/** BR-05. Applied to current statuses every time, never stored as a count. */
export type SplitRule =
  | { kind: 'allGoing' }
  | { kind: 'allGoingExcept'; people: string[] }
  | { kind: 'only'; people: string[] };

/** BR-06. */
export type Certainty =
  | { kind: 'exact'; value: Centavos }
  | { kind: 'range'; low: Centavos; high: Centavos }
  | { kind: 'estimate'; value: Centavos; marginPct?: number }
  | { kind: 'unknown'; max?: Centavos | null };

export type CostType = 'shared' | 'perPerson' | 'perGroup' | 'optional';

export interface CostInput {
  id: string;
  kind: 'normal' | 'gas';
  certainty: Certainty;
  costType: CostType;
  /** Per group of N (BR-03). */
  groupSize?: number;
  /** Optional costs work like Shared or Per person (BR-04). */
  optionalBasis?: 'shared' | 'perPerson';
  split: SplitRule;
}

export interface GasSettings {
  distanceKm: number;
  kmPerL: number;
  bufferPct: number;
  /** Price per liter, in centavos. */
  fuelPrice: Centavos;
}

export interface Bounds {
  low: Centavos;
  high: Centavos;
}

export const DEFAULT_ESTIMATE_MARGIN = 20;

// ---------------------------------------------------------------------------
// parseAmount (US-13)

export type ParseResult = { ok: true; value: Centavos } | { ok: false; error: string };

/**
 * Parses text such as "50*5" into centavos. Digits, a decimal point,
 * + − * / and parentheses only. Empty input, other characters, division by
 * zero and results of zero or less are errors.
 */
export function parseAmount(text: string): ParseResult {
  const src = text.replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/\s+/g, '');
  if (src === '') return { ok: false, error: 'Type an amount' };
  if (!/^[0-9.+\-*/()]+$/.test(src)) return { ok: false, error: 'Only numbers and + − × ÷ ( )' };

  let pos = 0;
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  const peek = () => src[pos];

  const number = (): number => {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(pos));
    if (!m) fail('That math doesn’t add up');
    pos += m![0].length;
    return parseFloat(m![0]);
  };
  const factor = (): number => {
    const c = peek();
    if (c === '+') { pos++; return factor(); }
    if (c === '-') { pos++; return -factor(); }
    if (c === '(') {
      pos++;
      const v = expr();
      if (peek() !== ')') fail('Missing )');
      pos++;
      return v;
    }
    return number();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++];
      const r = factor();
      if (op === '/' && r === 0) fail('Can’t divide by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  try {
    const v = expr();
    if (pos !== src.length) fail('That math doesn’t add up');
    if (!Number.isFinite(v)) fail('That math doesn’t add up');
    const c = Math.round(v * 100);
    if (c <= 0) fail('Amount must be more than zero');
    return { ok: true, value: c };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// resolveSplit (BR-05)

export function byJoinOrder<T extends { joinOrder: number }>(a: T, b: T): number {
  return a.joinOrder - b.joinOrder;
}

/** Keeps Going people, plus Maybe when includeMaybe is on, in joinOrder. */
export function resolveSplit<P extends PersonRef>(rule: SplitRule, people: P[], includeMaybe = false): P[] {
  const eligible = people
    .filter((p) => p.status === 'going' || (includeMaybe && p.status === 'maybe'))
    .sort(byJoinOrder);
  switch (rule.kind) {
    case 'allGoing':
      return eligible;
    case 'allGoingExcept':
      return eligible.filter((p) => !rule.people.includes(p.id));
    case 'only':
      return eligible.filter((p) => rule.people.includes(p.id));
  }
}

// ---------------------------------------------------------------------------
// Gas (BR-07)

export function gasLiters(g: GasSettings): number {
  if (g.kmPerL <= 0) return 0;
  return (g.distanceKm / g.kmPerL) * (1 + g.bufferPct / 100);
}

/** Rounded to the nearest centavo once, at the end. */
export function gasCost(g: GasSettings): Centavos {
  return Math.round(gasLiters(g) * g.fuelPrice);
}

// ---------------------------------------------------------------------------
// costBounds (BR-06, BR-07)

export interface CostBounds extends Bounds {
  /** Unknown with no maximum: left out of totals and flagged. */
  flagged: boolean;
}

export function costBounds(cost: CostInput, gas?: GasSettings | null): CostBounds {
  if (cost.kind === 'gas') {
    const v = gas ? gasCost(gas) : 0;
    return { low: v, high: v, flagged: !gas };
  }
  const c = cost.certainty;
  switch (c.kind) {
    case 'exact':
      return { low: c.value, high: c.value, flagged: false };
    case 'range':
      return { low: Math.min(c.low, c.high), high: Math.max(c.low, c.high), flagged: false };
    case 'estimate': {
      const m = c.marginPct ?? DEFAULT_ESTIMATE_MARGIN;
      return { low: c.value, high: Math.round(c.value * (1 + m / 100)), flagged: false };
    }
    case 'unknown':
      return c.max != null && c.max > 0
        ? { low: 0, high: c.max, flagged: false }
        : { low: 0, high: 0, flagged: true };
  }
}

/** Gas is always an estimate; everything else is exact only when marked Exact. */
export function isExact(cost: CostInput): boolean {
  return cost.kind !== 'gas' && cost.certainty.kind === 'exact';
}

// ---------------------------------------------------------------------------
// costTotal (BR-01 to BR-04)

function basis(cost: CostInput): 'shared' | 'perPerson' | 'perGroup' {
  if (cost.costType === 'optional') return cost.optionalBasis ?? 'perPerson';
  return cost.costType;
}

/** Number of groups for a Per group of N cost (BR-03). */
export function groupCount(n: number, groupSize: number): number {
  return n <= 0 ? 0 : Math.ceil(n / Math.max(1, groupSize));
}

export function costTotal(cost: CostInput, inSplit: number, gas?: GasSettings | null): Bounds {
  const b = costBounds(cost, gas);
  if (inSplit <= 0 || b.flagged) return { low: 0, high: 0 };
  switch (basis(cost)) {
    case 'shared':
      return { low: b.low, high: b.high };
    case 'perPerson':
      return { low: b.low * inSplit, high: b.high * inSplit };
    case 'perGroup': {
      const g = groupCount(inSplit, cost.groupSize ?? 1);
      return { low: b.low * g, high: b.high * g };
    }
  }
}

// ---------------------------------------------------------------------------
// allocate (BR-08)

/** Even split; leftover centavos go one each to people in the order given. */
export function allocate(total: Centavos, ids: string[]): Record<string, Centavos> {
  const out: Record<string, Centavos> = {};
  const n = ids.length;
  if (n === 0) return out;
  const base = Math.floor(total / n);
  let rest = total - base * n;
  for (const id of ids) {
    out[id] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return out;
}

// ---------------------------------------------------------------------------
// planShares (US-11)

export interface CostShare {
  costId: string;
  people: string[];
  total: Bounds;
  perPerson: Record<string, Bounds>;
  flagged: boolean;
}

export interface PlanShares {
  perPerson: Record<string, Bounds>;
  total: Bounds;
  /** Count of prices that are not Exact. */
  nonExact: number;
  /** Unknown prices with no maximum, left out of totals. */
  flagged: number;
  costs: CostShare[];
}

export function planShares(
  people: PersonRef[],
  costs: CostInput[],
  gas: GasSettings | null | undefined,
  includeMaybe = false,
): PlanShares {
  const perPerson: Record<string, Bounds> = {};
  for (const p of people) perPerson[p.id] = { low: 0, high: 0 };
  const total = { low: 0, high: 0 };
  let nonExact = 0;
  let flagged = 0;
  const shares: CostShare[] = [];

  for (const cost of costs) {
    if (!isExact(cost)) nonExact++;
    const inSplit = resolveSplit(cost.split, people, includeMaybe);
    const ids = inSplit.map((p) => p.id);
    const b = costBounds(cost, gas);
    if (b.flagged) flagged++;
    const t = costTotal(cost, ids.length, gas);
    const lows = allocate(t.low, ids);
    const highs = allocate(t.high, ids);
    const pp: Record<string, Bounds> = {};
    for (const id of ids) {
      pp[id] = { low: lows[id], high: highs[id] };
      perPerson[id].low += lows[id];
      perPerson[id].high += highs[id];
    }
    total.low += t.low;
    total.high += t.high;
    shares.push({ costId: cost.id, people: ids, total: t, perPerson: pp, flagged: b.flagged });
  }
  return { perPerson, total, nonExact, flagged, costs: shares };
}

// ---------------------------------------------------------------------------
// bringAmount (BR-09)

/** The person's high share rounded up to the next ₱50. */
export function bringAmount(high: Centavos): Centavos {
  return Math.ceil(high / 5000) * 5000;
}

// ---------------------------------------------------------------------------
// balances and settle (BR-10, BR-11)

export const POOL = 'pool';

export interface ExpenseInput {
  amount: Centavos;
  /** A person id, or POOL. */
  paidBy: string;
  split: SplitRule;
}

export interface ContributionInput {
  person: string;
  amount: Centavos;
}

export interface Balances {
  people: Record<string, Centavos>;
  /** Positive: the pool paid out more than it took in. Negative: cash left in the pool. */
  pool: Centavos;
  /** Each person's share of actual expenses. */
  shares: Record<string, Centavos>;
  /** What each person paid, including pool contributions. */
  paid: Record<string, Centavos>;
}

export function balances(
  expenses: ExpenseInput[],
  contributions: ContributionInput[],
  people: PersonRef[],
): Balances {
  const paid: Record<string, Centavos> = {};
  const shares: Record<string, Centavos> = {};
  for (const p of people) {
    paid[p.id] = 0;
    shares[p.id] = 0;
  }
  let pool = 0;

  for (const c of contributions) {
    if (c.person in paid) paid[c.person] += c.amount;
    pool -= c.amount;
  }
  for (const e of expenses) {
    if (e.paidBy === POOL) pool += e.amount;
    else if (e.paidBy in paid) paid[e.paidBy] += e.amount;
    const ids = resolveSplit(e.split, people).map((p) => p.id);
    const a = allocate(e.amount, ids);
    for (const id of ids) shares[id] += a[id];
  }

  const out: Record<string, Centavos> = {};
  for (const p of people) out[p.id] = paid[p.id] - shares[p.id];
  return { people: out, pool, shares, paid };
}

export interface Transfer {
  from: string;
  to: string;
  amount: Centavos;
}

/**
 * Largest debtor pays largest creditor until every balance is zero.
 * Ties go by joinOrder, so the result is the same every time. The pool takes
 * part only when it holds money or is owed money.
 */
export function settle(b: Balances, people: PersonRef[]): Transfer[] {
  const order = new Map<string, number>();
  for (const p of people) order.set(p.id, p.joinOrder);
  order.set(POOL, Number.MAX_SAFE_INTEGER);

  const bal = new Map<string, number>(Object.entries(b.people));
  if (b.pool !== 0) bal.set(POOL, b.pool);

  const pick = (sign: 1 | -1): string | null => {
    let best: string | null = null;
    for (const [id, v] of bal) {
      if (sign * v <= 0) continue;
      if (
        best === null ||
        sign * v > sign * bal.get(best)! ||
        (sign * v === sign * bal.get(best)! && order.get(id)! < order.get(best)!)
      )
        best = id;
    }
    return best;
  };

  const transfers: Transfer[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    const debtor = pick(-1);
    const creditor = pick(1);
    if (!debtor || !creditor) break;
    const amount = Math.min(-bal.get(debtor)!, bal.get(creditor)!);
    transfers.push({ from: debtor, to: creditor, amount });
    bal.set(debtor, bal.get(debtor)! + amount);
    bal.set(creditor, bal.get(creditor)! - amount);
  }
  return transfers;
}
