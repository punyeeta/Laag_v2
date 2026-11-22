// Every write goes through here. Each one commits the change and its
// Activity entry in the same batch, so the log can't be skipped (Phase 3).
// Writes aren't awaited: Firestore applies them to the local cache at once
// and sends them when there's signal (US-14).
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore';
import { addDays, shiftToUpcoming } from '../lib/format';
import { db, deleteSignIn } from './firebase';
import { todayISO } from './hooks';
import { getState, reportError } from './store';
import type {
  Activity,
  ChecklistItem,
  Collection,
  Cost,
  Member,
  Note,
  Person,
  Profile,
  SavedCar,
  Stop,
  Trip,
  TripData,
} from './types';

export const newId = () => doc(collection(db, '_')).id;
export const newInviteCode = () => {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => c[Math.floor(Math.random() * c.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
};

type Doc = Record<string, unknown> | null;

function ref(tripId: string, coll: Collection, id: string): DocumentReference {
  if (coll === 'trip') return doc(db, 'trips', tripId);
  if (coll === 'note') return doc(db, 'trips', tripId, 'notes', 'main');
  return doc(db, 'trips', tripId, coll, id);
}
const activityRef = (tripId: string, id: string) => doc(db, 'trips', tripId, 'activity', id);

function readDoc(t: TripData, coll: Collection, id: string): Doc {
  if (coll === 'trip') return t.trip as unknown as Doc;
  if (coll === 'note') return t.note as unknown as Doc;
  return ((t[coll] as Record<string, unknown>)[id] as Doc) ?? null;
}

/** Fields that only exist on this device (like the offline flag) aren't stored. */
function clean<T>(d: T): T {
  if (!d || typeof d !== 'object') return d;
  const { pending: _p, ...rest } = d as Record<string, unknown>;
  void _p;
  return rest as T;
}

/**
 * Most screens don't wait on this. Duplicating and deleting an account do;
 * it resolves to false if the server refused the write.
 */
function commit(b: WriteBatch, ctx: Parameters<typeof reportError>[1] = {}): Promise<boolean> {
  return b.commit().then(
    () => true,
    (e) => {
      reportError(e, ctx);
      return false;
    },
  );
}

/** The trip is saved once both of its batches are. */
export interface Created {
  id: string;
  done: Promise<boolean>;
}

function activityEntry(summary: string, target?: Activity['target'], before?: unknown, after?: unknown): Activity {
  return {
    id: newId(),
    actorUid: getState().me.uid,
    summary,
    ...(target ? { target, before: before ?? null, after: after ?? null } : {}),
    at: Date.now(),
  };
}

/** Adds the Activity entry, or folds it into my last one when I'm still typing. */
function logTo(b: WriteBatch, t: TripData, summary: string, coll: Collection, id: string, before: Doc, after: Doc) {
  const me = getState().me;
  const last = t.activity[0];
  if (
    last &&
    after &&
    last.actorUid === me.uid &&
    last.target?.collection === coll &&
    last.target.id === id &&
    last.after != null &&
    !last.undoneAt &&
    (coll === 'note' || last.summary === summary) &&
    Date.now() - last.at < 60_000
  ) {
    b.update(activityRef(t.trip.id, last.id), { after: clean(after), at: Date.now() });
    return;
  }
  const a = activityEntry(summary, { collection: coll, id }, clean(before), clean(after));
  b.set(activityRef(t.trip.id, a.id), a);
}

/**
 * Writes one whole document (or deletes it when `after` is null) and logs
 * who, when, the old and the new value.
 */
export function write<T extends object>(tripId: string, coll: Collection, id: string, after: T | null, summary: string) {
  const t = getState().trips[tripId];
  if (!t) return;
  const before = readDoc(t, coll, id);
  const b = writeBatch(db);
  if (after) b.set(ref(tripId, coll, id), clean(after));
  else b.delete(ref(tripId, coll, id));
  logTo(b, t, summary, coll, id, before, after as Doc);
  commit(b, { tripId });
}

/** Changes single fields, so two people editing different fields don't clash. */
export function update<T extends object>(tripId: string, coll: Collection, id: string, patch: Partial<T>, summary: string) {
  const t = getState().trips[tripId];
  const cur = t && readDoc(t, coll, id);
  if (!t || !cur) return;
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) fields[k] = v === undefined ? deleteField() : v;
  const after = { ...cur, ...patch };
  const b = writeBatch(db);
  b.update(ref(tripId, coll, id), fields);
  logTo(b, t, summary, coll, id, cur, after);
  commit(b, { tripId });
}

/** Undo restores the old value (US-18). Members can undo only their own changes. */
export function canUndo(t: TripData, a: Activity, uid: string): boolean {
  if (!a.target || a.undoneAt) return false;
  if (a.actorUid === uid) return true;
  const removed = !t.members[a.actorUid];
  return removed && t.trip.organizerUid === uid;
}

function addUndo(b: WriteBatch, t: TripData, a: Activity) {
  if (!a.target) return;
  const r = ref(t.trip.id, a.target.collection, a.target.id);
  if (a.before) b.set(r, a.before as object);
  else b.delete(r);
  b.update(activityRef(t.trip.id, a.id), { undoneAt: Date.now() });
}

export function undo(tripId: string, activityId: string) {
  const t = getState().trips[tripId];
  const a = t?.activity.find((x) => x.id === activityId);
  if (!t || !a || !canUndo(t, a, getState().me.uid)) return;
  const b = writeBatch(db);
  addUndo(b, t, a);
  commit(b, { tripId });
}

// ---------------------------------------------------------------------------
// Trips

export interface NewTripInput {
  /** Your name in this trip; defaults to the profile's default name. */
  myName?: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  gas: Trip['gas'];
}

interface TripContents {
  stops?: Stop[];
  costs?: Cost[];
  checklist?: ChecklistItem[];
  note?: Note;
  extraPeople?: Person[];
  summary?: string;
  tripPatch?: Partial<Trip>;
}

/**
 * Two batches: the trip with my membership first, then everything else. The
 * security rules check membership against what's already saved, so the
 * second batch must come after the first.
 */
export function createTrip({ myName, ...input }: NewTripInput, contents: TripContents = {}): Created {
  const { me, profile } = getState();
  const id = newId();
  const now = Date.now();
  const trip: Trip = {
    id,
    ...input,
    status: 'planning',
    statusMode: profile.tripDefaults?.statusMode ?? 'manual',
    organizerUid: me.uid,
    inviteCode: newInviteCode(),
    requireApproval: profile.tripDefaults?.requireApproval ?? false,
    createdAt: now,
    ...contents.tripPatch,
  };
  const meId = newId();
  const member: Member = { uid: me.uid, code: trip.inviteCode, joinedAt: now, personId: meId, approved: true };

  const first = writeBatch(db);
  first.set(doc(db, 'trips', id), trip);
  first.set(doc(db, 'trips', id, 'members', me.uid), member);
  const firstDone = commit(first, { what: 'the new trip' });

  const second = writeBatch(db);
  const name = myName?.trim() || profile.defaultName?.trim() || me.name;
  const mine: Person = { id: meId, name, status: 'going', joinOrder: 0, claimedBy: me.uid };
  second.set(doc(db, 'trips', id, 'people', meId), mine);
  for (const p of contents.extraPeople ?? []) second.set(doc(db, 'trips', id, 'people', p.id), p);
  for (const s of contents.stops ?? []) second.set(doc(db, 'trips', id, 'stops', s.id), s);
  for (const c of contents.costs ?? []) second.set(doc(db, 'trips', id, 'costs', c.id), c);
  for (const c of contents.checklist ?? []) second.set(doc(db, 'trips', id, 'checklist', c.id), c);
  second.set(doc(db, 'trips', id, 'notes', 'main'), contents.note ?? { text: '', updatedAt: now, updatedBy: null });
  const a = activityEntry(contents.summary ?? `created ${trip.name}`);
  second.set(activityRef(id, a.id), a);
  const secondDone = commit(second, { what: 'the new trip' });
  return { id, done: Promise.all([firstDone, secondDone]).then(([x, y]) => x && y) };
}

/** Copies I've already made of a trip, so I'm not duplicating it twice by accident. */
export function existingCopies(sourceId: string): TripData[] {
  return Object.values(getState().trips).filter((t) => t.trip.duplicatedFrom === sourceId);
}

/** US-02: copies stops, costs, checklists and trip variables; no people, expenses or activity. */
export function duplicateTrip(sourceId: string): Created | null {
  const src = getState().trips[sourceId];
  if (!src) return null;
  // A copy of a past trip moves forward by whole years (Aug 4, 2026 → Aug 4,
  // 2027), with its stops; an upcoming trip keeps its dates.
  const shift = shiftToUpcoming(src.trip.startDate, todayISO());
  const move = (iso: string) => (iso && shift ? addDays(iso, shift) : iso);
  const stopMap: Record<string, string> = {};
  const stops = Object.values(src.stops).map((s) => {
    const nid = newId();
    stopMap[s.id] = nid;
    return { ...s, id: nid, date: move(s.date) };
  });
  // Splits that name people can't carry over, since people aren't copied.
  const costs = Object.values(src.costs).map((c) => ({
    ...c,
    id: newId(),
    stopId: c.stopId ? stopMap[c.stopId] ?? null : null,
    split: c.split.kind === 'allGoing' ? c.split : ({ kind: 'allGoing' } as const),
  }));
  const checklist = Object.values(src.checklist).map((c) => ({
    ...c,
    id: newId(),
    done: false,
    doneBy: undefined,
    assignee: c.assignee === 'byo' ? 'byo' : null,
  }));
  return createTrip(
    {
      name: `${src.trip.name} (copy)`,
      destination: src.trip.destination,
      startDate: move(src.trip.startDate),
      endDate: move(src.trip.endDate),
      gas: src.trip.gas ? { ...src.trip.gas } : null,
    },
    {
      stops,
      costs,
      checklist,
      note: { text: src.note.text, updatedAt: Date.now(), updatedBy: null },
      summary: `duplicated this trip from ${src.trip.name}`,
      tripPatch: { duplicatedFrom: sourceId },
    },
  );
}

/** Deletes the trip and everything in it that this device has loaded. */
export function deleteTrip(tripId: string) {
  const t = getState().trips[tripId];
  if (!t) return;
  const b = writeBatch(db);
  const subs = ['people', 'stops', 'costs', 'expenses', 'contributions', 'payments', 'checklist'] as const;
  for (const s of subs) for (const id of Object.keys(t[s])) b.delete(doc(db, 'trips', tripId, s, id));
  // Activity is append-only (the rules don't allow deleting it), so it stays.
  b.delete(doc(db, 'trips', tripId, 'notes', 'main'));
  for (const uid of Object.keys(t.members)) b.delete(doc(db, 'trips', tripId, 'members', uid));
  b.delete(doc(db, 'trips', tripId));
  commit(b, { tripId });
}

// ---------------------------------------------------------------------------
// People and joining

export function addPerson(tripId: string, name: string, status: Person['status'] = 'going') {
  const t = getState().trips[tripId];
  const joinOrder = Math.max(-1, ...Object.values(t.people).map((p) => p.joinOrder)) + 1;
  const p: Person = { id: newId(), name: name.trim(), status, joinOrder, claimedBy: null };
  write(tripId, 'people', p.id, p, `added ${p.name}`);
}

/** US-20: removing someone frees their name and undoes every change from their phone. */
export function removePerson(tripId: string, personId: string) {
  const t = getState().trips[tripId];
  const p = t?.people[personId];
  if (!t || !p) return;
  const b = writeBatch(db);
  if (p.claimedBy) {
    const uid = p.claimedBy;
    for (const a of t.activity) if (a.actorUid === uid && a.target && !a.undoneAt) addUndo(b, t, a);
    b.delete(doc(db, 'trips', tripId, 'members', uid));
  }
  b.delete(doc(db, 'trips', tripId, 'people', personId));
  const a = activityEntry(`removed ${p.name}`, { collection: 'people', id: personId }, p, null);
  b.set(activityRef(tripId, a.id), a);
  commit(b, { tripId });
}

/**
 * Step 1 of joining from a link: create my member record with the invite
 * code. Approved straight away, unless the trip requires approval; the rules
 * refuse the first try in that case, so we ask again as "waiting".
 */
export async function joinWithCode(tripId: string, code: string): Promise<'joined' | 'waiting' | 'denied'> {
  const me = getState().me;
  const r = doc(db, 'trips', tripId, 'members', me.uid);
  const m: Member = { uid: me.uid, code, joinedAt: Date.now(), personId: null, approved: true };
  try {
    await setDoc(r, m);
    return 'joined';
  } catch {
    try {
      await setDoc(r, { ...m, approved: false });
      return 'waiting';
    } catch {
      return 'denied';
    }
  }
}

/** Step 2: tap my name. A name can be taken only once. */
export async function claimPerson(tripId: string, personId: string) {
  const t = getState().trips[tripId];
  const me = getState().me;
  const member = t?.members[me.uid];
  const p = t?.people[personId];
  if (!t || !member || !p) return;
  if (!member.approved) {
    // Waiting: I can only say which name I tapped. The organizer approves.
    await updateDoc(doc(db, 'trips', tripId, 'members', me.uid), { personId }).catch((e) => reportError(e, { tripId, what: 'your name choice' }));
    return;
  }
  const b = writeBatch(db);
  b.update(doc(db, 'trips', tripId, 'members', me.uid), { personId });
  b.update(doc(db, 'trips', tripId, 'people', personId), { claimedBy: me.uid });
  if (member.personId && member.personId !== personId && t.people[member.personId]?.claimedBy === me.uid)
    b.update(doc(db, 'trips', tripId, 'people', member.personId), { claimedBy: null });
  const a = activityEntry(`joined as ${p.name}`);
  b.set(activityRef(tripId, a.id), a);
  commit(b, { tripId });
}

/** The organizer approves a waiting member and gives them the name they tapped. */
export function approveMember(tripId: string, uid: string) {
  const t = getState().trips[tripId];
  const m = t?.members[uid];
  if (!t || !m) return;
  const p = m.personId ? t.people[m.personId] : undefined;
  const b = writeBatch(db);
  b.update(doc(db, 'trips', tripId, 'members', uid), { approved: true });
  if (p && !p.claimedBy) b.update(doc(db, 'trips', tripId, 'people', p.id), { claimedBy: uid });
  const a = activityEntry(`approved ${p?.name ?? 'a new member'}`);
  b.set(activityRef(tripId, a.id), a);
  commit(b, { tripId });
}

/**
 * The organizer frees a claimed name, so its owner can tap it again on a new
 * phone. The old browser stays a member but no longer holds the name.
 */
export function freeUpName(tripId: string, personId: string) {
  const t = getState().trips[tripId];
  const p = t?.people[personId];
  if (!t || !p?.claimedBy) return;
  const b = writeBatch(db);
  b.update(doc(db, 'trips', tripId, 'people', personId), { claimedBy: null });
  if (t.members[p.claimedBy]) b.update(doc(db, 'trips', tripId, 'members', p.claimedBy), { personId: null });
  const a = activityEntry(`freed up the name ${p.name}`);
  b.set(activityRef(tripId, a.id), a);
  commit(b, { tripId });
}

/** Leave a trip: give the name back and drop my membership. The name stays in the splits. */
export function leaveTrip(tripId: string): Promise<boolean> {
  const t = getState().trips[tripId];
  const me = getState().me;
  const m = t?.members[me.uid];
  if (!t || !m) return Promise.resolve(true);
  const b = writeBatch(db);
  if (m.approved) {
    const mine = Object.values(t.people).find((p) => p.claimedBy === me.uid);
    if (mine) b.update(doc(db, 'trips', tripId, 'people', mine.id), { claimedBy: null });
    const a = activityEntry(`left the trip${mine ? ` (${mine.name} is now a guest)` : ''}`);
    b.set(activityRef(tripId, a.id), a);
  }
  b.delete(doc(db, 'trips', tripId, 'members', me.uid));
  return commit(b, { tripId, what: 'leaving the trip' });
}

// ---------------------------------------------------------------------------
// You: profile and saved cars (users/{uid}), private to you.

export function saveProfile(patch: Partial<Profile>) {
  const me = getState().me;
  const what =
    'pinnedTripId' in patch ? 'your pin' : 'defaultName' in patch ? 'your name' : 'your new trip defaults';
  setDoc(doc(db, 'users', me.uid), patch, { merge: true }).catch((e) => reportError(e, { what }));
}

export function saveCar(car: Omit<SavedCar, 'id'>): SavedCar {
  const me = getState().me;
  const c = { ...car, id: newId() };
  setDoc(doc(db, 'users', me.uid, 'cars', c.id), c).catch((e) => reportError(e, { what: 'the car' }));
  return c;
}

/** Trips keep their own copy of a car's values, so editing a car doesn't change past trips. */
export function updateCar(car: SavedCar) {
  const me = getState().me;
  setDoc(doc(db, 'users', me.uid, 'cars', car.id), car).catch((e) => reportError(e, { what: 'the car' }));
}

export function deleteCar(id: string) {
  const me = getState().me;
  deleteDoc(doc(db, 'users', me.uid, 'cars', id)).catch((e) => reportError(e, { what: 'the car' }));
}

/** Trips you organize; they have to be deleted before you can delete your account. */
export function organizedTrips(): TripData[] {
  const s = getState();
  return Object.values(s.trips).filter((t) => t.trip.organizerUid === s.me.uid);
}

/**
 * Deletes your account: leaves every trip (your names become guests),
 * removes your profile and cars, then the sign-in itself.
 */
export async function deleteAccount() {
  const s = getState();
  if (organizedTrips().length) throw new Error('organizer');
  await Promise.all(Object.keys(s.trips).map((id) => leaveTrip(id)));
  const b = writeBatch(db);
  for (const id of Object.keys(s.cars)) b.delete(doc(db, 'users', s.me.uid, 'cars', id));
  b.delete(doc(db, 'users', s.me.uid));
  await b.commit();
  await deleteSignIn();
}
