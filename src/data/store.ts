// Live state from Firestore (Iteration 3). Snapshots are the state: each
// listener below writes its documents into one AppState, and the hooks read
// from it. Screens never talk to Firestore directly.
import { onAuthStateChanged, type User as FbUser } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { auth, db } from './firebase';
import type { Activity, AppState, Collection, Note, Profile, SavedCar, Trip, TripData, User } from './types';

const NO_USER: User = { uid: '', name: '', isAnonymous: true };

let state: AppState = {
  auth: 'loading',
  ready: false,
  memberOf: [],
  me: NO_USER,
  trips: {},
  cars: {},
  profile: {},
  pendingWrites: 0,
  error: null,
};
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

/**
 * Shows a refused or failed write. `what` names the thing ("your pin"); with
 * `tripId`, the approval hint appears only if I'm actually waiting for it.
 */
export function reportError(e: unknown, ctx: { what?: string; tripId?: string; message?: string } = {}) {
  const code = (e as { code?: string }).code ?? '';
  console.error(e);
  if (ctx.message) return setState({ error: ctx.message });
  const thing = ctx.what ?? 'that change';
  let error: string;
  if (code === 'permission-denied') {
    const member = ctx.tripId ? state.trips[ctx.tripId]?.members[state.me.uid] : undefined;
    error =
      member && !member.approved
        ? 'You can’t change this trip until the organizer approves you.'
        : `Couldn’t save ${thing}: it wasn’t allowed, so it was undone.`;
  } else if (code === 'unavailable') {
    error = `Couldn’t save ${thing}. Check your connection and try again.`;
  } else {
    error = `Couldn’t save ${thing}. Try again.`;
  }
  setState({ error: error.charAt(0).toUpperCase() + error.slice(1) });
}
export const clearError = () => setState({ error: null });

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

// ---------------------------------------------------------------------------
// One trip: the trip document plus each subcollection.

const SUBS = ['members', 'people', 'stops', 'costs', 'expenses', 'contributions', 'payments', 'checklist'] as const;
type Sub = (typeof SUBS)[number];

interface Live {
  unsubs: (() => void)[];
  trip?: Trip;
  gone?: boolean;
  subs: Partial<Record<Sub, Record<string, unknown>>>;
  note?: Note;
  activity: Activity[];
  pending: Partial<Record<Collection | 'activity', number>>;
}

const live = new Map<string, Live>();

function emptyNote(): Note {
  return { text: '', updatedAt: 0, updatedBy: null };
}

function emit(tripId: string) {
  const l = live.get(tripId);
  const trips = { ...state.trips };
  if (!l || !l.trip || l.gone) delete trips[tripId];
  else {
    trips[tripId] = {
      trip: l.trip,
      members: (l.subs.members ?? {}) as TripData['members'],
      people: (l.subs.people ?? {}) as TripData['people'],
      stops: (l.subs.stops ?? {}) as TripData['stops'],
      costs: (l.subs.costs ?? {}) as TripData['costs'],
      expenses: (l.subs.expenses ?? {}) as TripData['expenses'],
      contributions: (l.subs.contributions ?? {}) as TripData['contributions'],
      payments: (l.subs.payments ?? {}) as TripData['payments'],
      checklist: (l.subs.checklist ?? {}) as TripData['checklist'],
      note: l.note ?? emptyNote(),
      activity: l.activity,
    };
  }
  let pendingWrites = 0;
  for (const x of live.values()) for (const n of Object.values(x.pending)) pendingWrites += n ?? 0;
  setState({ trips, pendingWrites });
}

const countPending = (snap: QuerySnapshot) => snap.docs.filter((d) => d.metadata.hasPendingWrites).length;

/**
 * Keeps a listener alive. Right after a trip is created or joined, its
 * membership exists on this phone before the server has it, so the server
 * may refuse the first listen; Firestore then stops that listener for good.
 * We try again with growing gaps (1s, 2s, 4s… about a minute in all).
 */
function keep(tripId: string, l: Live, start: (onError: () => void) => () => void, onGiveUp?: () => void) {
  let attempt = 0;
  let unsub: () => void = () => undefined;
  const go = () => {
    unsub = start(() => {
      if (live.get(tripId) !== l) return;
      if (attempt < 6) {
        const delay = 1000 * 2 ** attempt++;
        setTimeout(() => {
          if (live.get(tripId) === l) go();
        }, delay);
      } else onGiveUp?.();
    });
  };
  go();
  l.unsubs.push(() => unsub());
}

function watchTrip(tripId: string) {
  if (live.has(tripId)) return;
  const l: Live = { unsubs: [], subs: {}, activity: [], pending: {} };
  live.set(tripId, l);
  const meta = { includeMetadataChanges: true };

  keep(
    tripId,
    l,
    (onError) =>
      onSnapshot(
        doc(db, 'trips', tripId),
        meta,
        (snap) => {
          l.gone = !snap.exists();
          if (snap.exists()) l.trip = { ...(snap.data() as Trip), id: snap.id };
          l.pending.trip = snap.metadata.hasPendingWrites ? 1 : 0;
          emit(tripId);
        },
        onError,
      ),
    () => {
      l.gone = true;
      emit(tripId);
    },
  );

  // Someone waiting for approval can't read most subcollections; those
  // listeners give up quietly and restart when they're approved.
  for (const sub of SUBS) {
    keep(tripId, l, (onError) =>
      onSnapshot(
        collection(db, 'trips', tripId, sub),
        meta,
        (snap) => {
          l.subs[sub] = Object.fromEntries(
            snap.docs.map((d) => {
              const data = { ...d.data(), id: d.id } as Record<string, unknown>;
              // US-14: an expense saved offline shows "Waiting to sync".
              if (sub === 'expenses') data.pending = d.metadata.hasPendingWrites;
              return [d.id, data];
            }),
          );
          l.pending[sub] = countPending(snap);
          emit(tripId);
        },
        onError,
      ),
    );
  }

  keep(tripId, l, (onError) =>
    onSnapshot(
      doc(db, 'trips', tripId, 'notes', 'main'),
      meta,
      (snap) => {
        l.note = snap.exists() ? (snap.data() as Note) : emptyNote();
        l.pending.note = snap.metadata.hasPendingWrites ? 1 : 0;
        emit(tripId);
      },
      onError,
    ),
  );

  keep(tripId, l, (onError) =>
    onSnapshot(
      query(collection(db, 'trips', tripId, 'activity'), orderBy('at', 'desc'), limit(300)),
      meta,
      (snap) => {
        l.activity = snap.docs.map((d) => ({ ...(d.data() as Activity), id: d.id }));
        emit(tripId);
      },
      onError,
    ),
  );
}

function unwatchTrip(tripId: string) {
  const l = live.get(tripId);
  if (!l) return;
  l.unsubs.forEach((u) => u());
  live.delete(tripId);
  emit(tripId);
}

// ---------------------------------------------------------------------------
// Signed-in user: my memberships and my saved cars.

let userUnsubs: (() => void)[] = [];
const approvedSeen = new Map<string, boolean>();

function stopUser() {
  userUnsubs.forEach((u) => u());
  userUnsubs = [];
  approvedSeen.clear();
  for (const id of [...live.keys()]) unwatchTrip(id);
}

function toUser(u: FbUser): User {
  return {
    uid: u.uid,
    name: u.displayName?.split(' ')[0] ?? (u.isAnonymous ? 'Guest' : 'You'),
    isAnonymous: u.isAnonymous,
    photoURL: u.photoURL,
    email: u.email,
  };
}

/** Call after linking Google to an anonymous account (the uid stays the same). */
export function refreshUser() {
  if (auth.currentUser) setState({ me: toUser(auth.currentUser) });
}

onAuthStateChanged(auth, (u) => {
  stopUser();
  if (!u) {
    setState({ auth: 'signedOut', ready: true, memberOf: [], me: NO_USER, trips: {}, cars: {}, profile: {}, pendingWrites: 0 });
    return;
  }
  setState({ auth: 'signedIn', ready: false, memberOf: [], me: toUser(u), trips: {}, cars: {}, profile: {} });

  userUnsubs.push(
    onSnapshot(
      doc(db, 'users', u.uid),
      (snap) => setState({ profile: (snap.data() as Profile | undefined) ?? {} }),
      () => undefined,
    ),
  );

  userUnsubs.push(
    onSnapshot(
      query(collectionGroup(db, 'members'), where('uid', '==', u.uid)),
      (snap) => {
        const ids = new Set(snap.docs.map((d) => d.ref.parent.parent!.id));
        for (const d of snap.docs) {
          const id = d.ref.parent.parent!.id;
          const approved = d.data().approved === true;
          if (approved && approvedSeen.get(id) === false) unwatchTrip(id); // approved: listen again with full access
          approvedSeen.set(id, approved);
        }
        for (const id of ids) watchTrip(id);
        for (const id of [...live.keys()]) if (!ids.has(id)) unwatchTrip(id);
        setState({ ready: true, memberOf: [...ids] });
      },
      (e) => {
        reportError(e, { message: 'Couldn’t load your trips. Check your connection, then refresh.' });
        setState({ ready: true });
      },
    ),
  );

  userUnsubs.push(
    onSnapshot(collection(db, 'users', u.uid, 'cars'), (snap) => {
      setState({
        cars: Object.fromEntries(snap.docs.map((d) => [d.id, { ...(d.data() as SavedCar), id: d.id }])),
      });
    }),
  );
});

if (typeof window !== 'undefined') {
  // Re-render the offline banner when the connection changes.
  window.addEventListener('online', () => listeners.forEach((l) => l()));
  window.addEventListener('offline', () => listeners.forEach((l) => l()));
}
