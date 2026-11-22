import { useOutletContext } from 'react-router-dom';
import { myPerson } from '../data/hooks';
import type { Person, TripData, User } from '../data/types';

export interface TripCtx {
  t: TripData;
  me: User;
  people: Person[];
  /** The Person the current user claimed in this trip. */
  mine: Person | undefined;
  isOrganizer: boolean;
  openQuickAdd: () => void;
}

export const useTripCtx = () => useOutletContext<TripCtx>();

export function personName(t: TripData, id: string | null | undefined, meUid?: string): string {
  if (!id) return 'No one';
  if (id === 'pool') return 'The pool';
  if (id === 'byo') return 'BYO';
  const p = t.people[id];
  if (!p) return 'Someone removed';
  return meUid && p.claimedBy === meUid ? 'You' : p.name;
}

/** Who did something, from the Activity log's uid. */
export function actor(t: TripData, uid: string, meUid: string): { name: string; joinOrder: number } {
  if (uid === meUid) {
    const p = myPerson(t, meUid);
    return { name: 'You', joinOrder: p?.joinOrder ?? 0 };
  }
  const p = Object.values(t.people).find((x) => x.claimedBy === uid);
  if (p) return { name: p.name, joinOrder: p.joinOrder };
  // A member who left, or sample data for a guest: fall back to the name.
  const raw = uid.replace(/^u-/, '');
  const guess = raw.charAt(0).toUpperCase() + raw.slice(1);
  const byName = Object.values(t.people).find((x) => x.name.toLowerCase() === raw.toLowerCase());
  return { name: byName?.name ?? guess, joinOrder: byName?.joinOrder ?? 9 };
}

export { myPerson };
