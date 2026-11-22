// Phase 2 entities. Only inputs are stored; every total is derived in calc.ts.
import type { CostInput, GasSettings, PersonRef, SplitRule } from '../lib/calc';
import type { Centavos } from '../lib/money';

export type TripStatus = 'planning' | 'ongoing' | 'settled';

export interface TripGas extends GasSettings {
  fuelPriceCheckedAt?: string;
  carName?: string;
  fuelType?: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  status: TripStatus;
  statusMode: 'manual' | 'auto';
  organizerUid: string;
  inviteCode: string;
  requireApproval: boolean;
  gas: TripGas | null;
  duplicatedFrom?: string;
  createdAt: number;
}

export interface Member {
  uid: string;
  code: string;
  joinedAt: number;
  personId: string | null;
  approved: boolean;
}

export interface Person extends PersonRef {
  name: string;
  /** uid of the member who took this name; null means a guest. */
  claimedBy: string | null;
  note?: string;
}

export interface Stop {
  id: string;
  date: string;
  time: string; // HH:MM
  place: string;
  note?: string;
}

export interface Cost extends CostInput {
  label: string;
  stopId: string | null;
  category?: string;
  note?: string;
  source?: string;
  checkedAt?: string;
}

export interface Expense {
  id: string;
  amount: Centavos;
  label: string;
  /** A person id, or 'pool'. */
  paidBy: string;
  split: SplitRule;
  stopId: string | null;
  date: string;
  createdBy: string;
  createdAt: number;
  /** Saved while offline, waiting to sync (US-14). */
  pending?: boolean;
}

export interface Contribution {
  id: string;
  person: string;
  amount: Centavos;
  createdAt: number;
}

export interface Payment {
  id: string;
  from: string;
  to: string;
  amount: Centavos;
  paidAt: number;
  note?: string;
}

export interface ChecklistItem {
  id: string;
  group: 'food' | 'materials';
  label: string;
  /** A person id, 'byo', or null for no one. */
  assignee: string | null;
  price?: Centavos;
  whereToBuy?: string;
  note?: string;
  done: boolean;
  doneBy?: string;
  order: number;
}

export interface Note {
  text: string;
  updatedAt: number;
  updatedBy: string | null;
}

export type Collection =
  | 'trip'
  | 'note'
  | 'members'
  | 'people'
  | 'stops'
  | 'costs'
  | 'expenses'
  | 'contributions'
  | 'payments'
  | 'checklist';

export interface Activity {
  id: string;
  actorUid: string;
  /** Text after the actor's name, e.g. "changed the fuel price from ₱92.00 to ₱95.22". */
  summary: string;
  target?: { collection: Collection; id: string };
  before?: unknown;
  after?: unknown;
  at: number;
  undoneAt?: number;
}

export interface TripData {
  trip: Trip;
  members: Record<string, Member>;
  people: Record<string, Person>;
  stops: Record<string, Stop>;
  costs: Record<string, Cost>;
  expenses: Record<string, Expense>;
  contributions: Record<string, Contribution>;
  payments: Record<string, Payment>;
  checklist: Record<string, ChecklistItem>;
  note: Note;
  activity: Activity[];
}

export interface SavedCar {
  id: string;
  name: string;
  kmPerL: number;
  fuelType: string;
}

export interface User {
  uid: string;
  name: string;
  /** Joined from a link without signing in to Google. */
  isAnonymous: boolean;
  photoURL?: string | null;
  email?: string | null;
}

/** users/{uid}: settings about you across trips. Per-trip things live on the trip. */
export interface Profile {
  /** Filled in as "Your name in this trip" when you create one. */
  defaultName?: string;
  /** The trip shown big on the dashboard. Without one, the next trip is shown. */
  pinnedTripId?: string | null;
  tripDefaults?: {
    statusMode: Trip['statusMode'];
    requireApproval: boolean;
  };
}

export interface AppState {
  auth: 'loading' | 'signedOut' | 'signedIn';
  /** The list of my trips has loaded at least once. */
  ready: boolean;
  /** Trip ids I'm a member of; their data may still be loading. */
  memberOf: string[];
  me: User;
  trips: Record<string, TripData>;
  cars: Record<string, SavedCar>;
  profile: Profile;
  /** Writes made while offline that haven't synced (US-14). */
  pendingWrites: number;
  /** Last write that the server refused, shown as a toast. */
  error: string | null;
}
