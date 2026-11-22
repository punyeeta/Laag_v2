// Two small sample trips that are easy to follow:
// - "Sample: Beach Day" (upcoming): a few stops and costs, one of each kind
//   of price, so you can see how shares and the bring amount work.
// - "Sample: Weekend Hike" (finished): three people paid for things, and
//   Settle up shows who pays whom.
// Everyone except you is "Guest 1", "Guest 2"…; dates are relative to the
// day you add them.
import { collection, doc, writeBatch } from 'firebase/firestore';
import { addDays } from '../lib/format';
import { pesos } from '../lib/money';
import { db } from './firebase';
import { todayISO } from './hooks';
import { getState, reportError } from './store';
import type {
  Activity,
  ChecklistItem,
  Cost,
  Expense,
  Member,
  Note,
  Payment,
  Person,
  Stop,
  Trip,
  User,
} from './types';

interface SampleTrip {
  trip: Trip;
  people: Person[];
  stops: Stop[];
  costs: Cost[];
  expenses: Expense[];
  payments: Payment[];
  checklist: ChecklistItem[];
  note: Note;
  activity: Activity[];
}

const newKey = () => doc(collection(db, '_')).id;

function people(myName: string, me: string, statuses: Person['status'][]): Person[] {
  return statuses.map((status, i) => ({
    id: newKey(),
    name: i === 0 ? myName : `Guest ${i}`,
    status,
    joinOrder: i,
    claimedBy: i === 0 ? me : null,
  }));
}

function baseTrip(id: string, me: string, fields: Pick<Trip, 'name' | 'destination' | 'startDate' | 'endDate' | 'status'>): Trip {
  return {
    id,
    ...fields,
    statusMode: 'manual',
    organizerUid: me,
    inviteCode: `smp-${id.slice(0, 4)}`,
    requireApproval: false,
    gas: null,
    createdAt: Date.now(),
  };
}

function beachDay(myName: string, me: string): SampleTrip {
  const day = addDays(todayISO(), 30);
  const ps = people(myName, me, ['going', 'going', 'going', 'maybe']);
  const [you, g1] = ps;
  const stop = (time: string, place: string, note?: string): Stop => ({ id: newKey(), date: day, time, place, note });
  const meet = stop('07:00', 'Meet at the bus terminal', 'Bring your own water');
  const beach = stop('09:00', 'Beach resort', 'Day use only');
  const lunch = stop('12:00', 'Lunch at the cottage');
  const cost = (c: Omit<Cost, 'id' | 'kind' | 'split'>): Cost => ({ id: newKey(), kind: 'normal', split: { kind: 'allGoing' }, ...c });
  const item = (group: ChecklistItem['group'], label: string, assignee: string | null, done: boolean, order: number): ChecklistItem => ({
    id: newKey(),
    group,
    label,
    assignee,
    done,
    order,
  });
  const now = Date.now();
  return {
    trip: baseTrip(newKey(), me, { name: 'Sample: Beach Day', destination: 'Beach', startDate: day, endDate: day, status: 'planning' }),
    people: ps,
    stops: [meet, beach, lunch],
    costs: [
      // One of each kind of price, so the totals show a range.
      cost({ label: 'Van rental', stopId: meet.id, category: 'Travel', certainty: { kind: 'exact', value: pesos(3000) }, costType: 'shared' }),
      cost({ label: 'Entrance fee', stopId: beach.id, category: 'Beach', certainty: { kind: 'exact', value: pesos(150) }, costType: 'perPerson' }),
      cost({ label: 'Cottage', stopId: beach.id, category: 'Beach', certainty: { kind: 'range', low: pesos(500), high: pesos(800) }, costType: 'shared' }),
      cost({ label: 'Lunch groceries', stopId: lunch.id, category: 'Food', certainty: { kind: 'estimate', value: pesos(1200), marginPct: 20 }, costType: 'shared' }),
    ],
    expenses: [],
    payments: [],
    checklist: [
      item('food', 'Rice', you.id, true, 0),
      item('food', 'Drinks', g1.id, false, 1),
      item('materials', 'Sunblock', 'byo', false, 2),
      item('materials', 'Speaker', null, false, 3),
    ],
    note: {
      text: 'Meeting point: bus terminal, 7:00 AM.\nBring: swimsuit, towel and extra clothes.',
      updatedAt: now,
      updatedBy: me,
    },
    activity: [{ id: newKey(), actorUid: me, summary: 'added the sample trip', at: now }],
  };
}

function weekendHike(myName: string, me: string): SampleTrip {
  const start = addDays(todayISO(), -30);
  const ps = people(myName, me, ['going', 'going', 'going', 'going']);
  const [you, g1, g2, g3] = ps;
  const at = (d: string) => new Date(`${d}T12:00:00`).getTime();
  const exp = (label: string, amount: number, paidBy: Person, date: string): Expense => ({
    id: newKey(),
    amount: pesos(amount),
    label,
    paidBy: paidBy.id,
    split: { kind: 'allGoing' },
    stopId: null,
    date,
    createdBy: me,
    createdAt: at(date),
  });
  // ₱4,000 in all, ₱1,000 each. You fronted ₱2,400, Guest 1 ₱1,200, Guest 2 ₱400,
  // so: Guest 3 → you ₱1,000, Guest 2 → you ₱400, Guest 2 → Guest 1 ₱200.
  return {
    trip: baseTrip(newKey(), me, {
      name: 'Sample: Weekend Hike',
      destination: 'Mountains',
      startDate: start,
      endDate: addDays(start, 1),
      status: 'settled',
    }),
    people: ps,
    stops: [],
    costs: [],
    expenses: [
      exp('Van rental', 2400, you, start),
      exp('Food', 1200, g1, start),
      exp('Campsite fee', 400, g2, addDays(start, 1)),
    ],
    payments: [{ id: newKey(), from: g3.id, to: you.id, amount: pesos(1000), paidAt: at(addDays(start, 2)), note: 'via GCash' }],
    checklist: [],
    note: { text: '', updatedAt: Date.now(), updatedBy: null },
    activity: [{ id: newKey(), actorUid: me, summary: 'added the sample trip', at: Date.now() }],
  };
}

/**
 * Writes the sample trips with you as organizer. Two batches per trip: the
 * trip and your membership first, since the rules check membership against
 * what's already saved. Resolves to false if the server refused any of it.
 */
export async function importSampleTrips(me: User): Promise<boolean> {
  const myName = getState().profile.defaultName?.trim() || me.name;
  const commits: Promise<boolean>[] = [];
  const commit = (b: ReturnType<typeof writeBatch>) =>
    commits.push(
      b.commit().then(
        () => true,
        (e) => {
          reportError(e, { what: 'the sample trips' });
          return false;
        },
      ),
    );

  for (const t of [beachDay(myName, me.uid), weekendHike(myName, me.uid)]) {
    const id = t.trip.id;
    const mine = t.people[0];
    const member: Member = { uid: me.uid, code: t.trip.inviteCode, joinedAt: Date.now(), personId: mine.id, approved: true };

    const first = writeBatch(db);
    first.set(doc(db, 'trips', id), t.trip);
    first.set(doc(db, 'trips', id, 'members', me.uid), member);
    commit(first);

    const second = writeBatch(db);
    for (const p of t.people) second.set(doc(db, 'trips', id, 'people', p.id), p);
    for (const s of t.stops) second.set(doc(db, 'trips', id, 'stops', s.id), s);
    for (const c of t.costs) second.set(doc(db, 'trips', id, 'costs', c.id), c);
    for (const e of t.expenses) second.set(doc(db, 'trips', id, 'expenses', e.id), e);
    for (const p of t.payments) second.set(doc(db, 'trips', id, 'payments', p.id), p);
    for (const c of t.checklist) second.set(doc(db, 'trips', id, 'checklist', c.id), c);
    second.set(doc(db, 'trips', id, 'notes', 'main'), t.note);
    for (const a of t.activity) second.set(doc(db, 'trips', id, 'activity', a.id), a);
    commit(second);
  }

  if (!navigator.onLine) return true; // saved on this phone; it syncs later
  return (await Promise.all(commits)).every(Boolean);
}
